/**
 * Isotopiq Script Hub — REPL session manager.
 *
 * Polls Supabase for `repl_sessions` rows that are queued (status='requested',
 * worker_id is null), claims them atomically, spawns a long-lived python3 -iu
 * or R --no-save --quiet --interactive child process, and brokers stdin/stdout/
 * stderr between the browser (via the `repl_io` table) and the child.
 *
 * Same outbound-only network model as the rest of the worker — everything
 * rides Supabase HTTPS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const SESSION_POLL_MS = Number(process.env.REPL_SESSION_POLL_MS ?? 1500);
const INPUT_POLL_MS   = Number(process.env.REPL_INPUT_POLL_MS ?? 400);
const STOP_POLL_MS    = Number(process.env.REPL_STOP_POLL_MS ?? 2000);
const MAX_CONCURRENT  = Number(process.env.REPL_MAX_CONCURRENT ?? 4);
const IDLE_TIMEOUT_MS = Number(process.env.REPL_IDLE_TIMEOUT_MS ?? 15 * 60_000);
const WALL_TIMEOUT_MS = Number(process.env.REPL_WALL_TIMEOUT_MS ?? 60 * 60_000);
const MAX_LINE_LEN    = 8000;

type Session = {
  id: string;
  user_id: string;
  language: "python" | "r";
};

const active = new Map<string, ChildProcessWithoutNullStreams>();

function restrictedEnv(): NodeJS.ProcessEnv {
  return {
    PATH:   process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME:   process.env.HOME ?? "/tmp",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG:   process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
    TERM:   "dumb",
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

function spawnChild(lang: "python" | "r"): ChildProcessWithoutNullStreams {
  if (lang === "python") {
    return spawn("python3", ["-iuq"], { env: restrictedEnv() }) as ChildProcessWithoutNullStreams;
  }
  // R interactive; suppress prompts so output isn't polluted.
  return spawn(
    "R",
    ["--no-save", "--quiet", "--interactive", "-e", 'options(prompt="", continue=""); invisible(commandArgs())'],
    { env: restrictedEnv() },
  ) as ChildProcessWithoutNullStreams;
}

async function writeIo(
  sb: SupabaseClient,
  session_id: string,
  kind: "out" | "err" | "sys",
  content: string,
) {
  if (!content) return;
  if (content.length > MAX_LINE_LEN) content = content.slice(0, MAX_LINE_LEN) + "…[truncated]";
  const { error } = await sb.from("repl_io").insert({ session_id, kind, content });
  if (error) console.error(`[repl ${session_id.slice(0, 8)}] io insert failed:`, error.message);
}

async function finalize(
  sb: SupabaseClient,
  session_id: string,
  reason: string,
  errored = false,
) {
  const child = active.get(session_id);
  if (child) {
    try { child.kill("SIGKILL"); } catch { /* ignore */ }
    active.delete(session_id);
  }
  await writeIo(sb, session_id, "sys", `[session ended: ${reason}]`);
  await sb.from("repl_sessions").update({
    status: errored ? "errored" : "stopped",
    stopped_at: new Date().toISOString(),
    error_message: errored ? reason : null,
  }).eq("id", session_id);
  console.log(`[repl ${session_id.slice(0, 8)}] finalized (${reason})`);
}

async function manageSession(sb: SupabaseClient, workerId: string, session: Session) {
  console.log(`[repl ${session.id.slice(0, 8)}] starting ${session.language} child`);
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnChild(session.language);
  } catch (err) {
    await finalize(sb, session.id, `spawn failed: ${(err as Error).message}`, true);
    return;
  }
  active.set(session.id, child);
  const startedAt = Date.now();
  let lastActivity = Date.now();
  let lastInputId = 0;
  let stoppedReason: string | null = null;
  let exited = false;

  // Determine starting input id so we don't replay history.
  const { data: lastIo } = await sb
    .from("repl_io")
    .select("id")
    .eq("session_id", session.id)
    .eq("kind", "in")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastIo) lastInputId = lastIo.id as number;

  await writeIo(sb, session.id, "sys",
    `[session connected on worker · ${session.language} · idle limit ${Math.round(IDLE_TIMEOUT_MS / 60000)}m]`);

  // Pipe child output line-by-line into repl_io.
  const pipeOutput = (stream: "out" | "err", src: NodeJS.ReadableStream) => {
    let buf = "";
    src.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.length > 0 || stream === "out") {
          void writeIo(sb, session.id, stream, line);
        }
      }
      // Flush partial chunk if it grows beyond a reasonable size (e.g. input() prompt with no newline).
      if (buf.length > 256) {
        void writeIo(sb, session.id, stream, buf);
        buf = "";
      }
    });
    src.on("end", () => { if (buf) void writeIo(sb, session.id, stream, buf); });
  };
  pipeOutput("out", child.stdout);
  pipeOutput("err", child.stderr);

  child.on("error", (err) => {
    console.error(`[repl ${session.id.slice(0, 8)}] child error:`, err.message);
    stoppedReason = stoppedReason ?? `child error: ${err.message}`;
  });
  child.on("close", (code) => {
    exited = true;
    stoppedReason = stoppedReason ?? `child exited (code ${code})`;
  });

  // Input poll loop — fetch new 'in' rows and write to child stdin.
  const inputTimer = setInterval(async () => {
    if (exited) return;
    const { data, error } = await sb
      .from("repl_io")
      .select("id, content")
      .eq("session_id", session.id)
      .eq("kind", "in")
      .gt("id", lastInputId)
      .order("id", { ascending: true })
      .limit(50);
    if (error) { console.error("input poll", error.message); return; }
    if (!data || data.length === 0) return;
    for (const row of data) {
      lastInputId = row.id as number;
      try {
        child.stdin.write((row.content as string) + "\n");
        lastActivity = Date.now();
      } catch (err) {
        console.error(`[repl ${session.id.slice(0, 8)}] stdin write failed:`, (err as Error).message);
      }
    }
  }, INPUT_POLL_MS);

  // Stop/timeouts loop.
  const stopTimer = setInterval(async () => {
    if (exited) { stoppedReason = stoppedReason ?? "child exited"; return; }
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      stoppedReason = "idle timeout";
      return;
    }
    if (Date.now() - startedAt > WALL_TIMEOUT_MS) {
      stoppedReason = "wallclock limit reached";
      return;
    }
    const { data } = await sb
      .from("repl_sessions")
      .select("stop_requested")
      .eq("id", session.id)
      .maybeSingle();
    if (data?.stop_requested) stoppedReason = "stopped by user";
  }, STOP_POLL_MS);

  // Wait until we have a reason to stop.
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (stoppedReason) { clearInterval(check); resolve(); }
    }, 250);
  });

  clearInterval(inputTimer);
  clearInterval(stopTimer);
  await finalize(sb, session.id, stoppedReason ?? "ended");
}

async function claimNext(sb: SupabaseClient, workerId: string): Promise<Session | null> {
  const { data: candidate, error: selErr } = await sb
    .from("repl_sessions")
    .select("id, user_id, language")
    .eq("status", "requested")
    .is("worker_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr) { console.error("[repl] poll select failed:", selErr.message); return null; }
  if (!candidate) return null;

  const { data: claimed, error } = await sb
    .from("repl_sessions")
    .update({
      status: "running",
      worker_id: workerId,
      claimed_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("status", "requested")
    .is("worker_id", null)
    .select("id, user_id, language")
    .maybeSingle();
  if (error) { console.error("repl claim failed:", error.message); return null; }
  return claimed as Session | null;
}

/**
 * Startup recovery: sessions left behind by a previous worker process.
 * - 'running' rows assigned to this worker have no live child → stop them.
 * - 'requested' rows older than 10 minutes were never claimed → expire them,
 *   so the one-active-per-user unique index stops blocking new sessions.
 */
async function recoverStaleSessions(sb: SupabaseClient, workerId: string) {
  const { data: orphaned, error: e1 } = await sb
    .from("repl_sessions")
    .update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
      error_message: "worker restarted",
    })
    .eq("worker_id", workerId)
    .eq("status", "running")
    .select("id");
  if (e1) console.error("[repl] orphan recovery failed:", e1.message);
  else if (orphaned?.length) console.log(`[repl] recovered ${orphaned.length} orphaned running session(s)`);

  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: expired, error: e2 } = await sb
    .from("repl_sessions")
    .update({
      status: "errored",
      stopped_at: new Date().toISOString(),
      error_message: "expired: no worker claimed the session in time",
    })
    .eq("status", "requested")
    .lt("created_at", cutoff)
    .select("id");
  if (e2) console.error("[repl] expiry sweep failed:", e2.message);
  else if (expired?.length) console.log(`[repl] expired ${expired.length} stale requested session(s)`);
}

export function startReplManager(sb: SupabaseClient, workerId: string) {
  console.log(`[repl] manager started · maxConcurrent=${MAX_CONCURRENT} · idle=${IDLE_TIMEOUT_MS}ms`);
  void recoverStaleSessions(sb, workerId);
  // Re-run the expiry sweep periodically so abandoned 'requested' rows never
  // permanently block a user (unique one-active-per-user index).
  setInterval(() => { void recoverStaleSessions(sb, workerId); }, 5 * 60_000);

  const tick = async () => {
    if (active.size >= MAX_CONCURRENT) return;
    try {
      const session = await claimNext(sb, workerId);
      if (!session) return;
      console.log(`[repl ${session.id.slice(0, 8)}] claimed (${session.language})`);
      void manageSession(sb, workerId, session).catch(async (err) => {
        console.error(`[repl ${session.id.slice(0, 8)}] crashed:`, err);
        await finalize(sb, session.id, `worker error: ${(err as Error).message}`, true);
      });
    } catch (err) {
      console.error("[repl] tick error:", err);
    }
  };

  setInterval(() => { void tick(); }, SESSION_POLL_MS);
  void tick();
}

export async function shutdownAllSessions(sb: SupabaseClient) {
  const ids = Array.from(active.keys());
  for (const id of ids) {
    try { active.get(id)?.kill("SIGKILL"); } catch { /* ignore */ }
    active.delete(id);
    await sb.from("repl_sessions").update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
      error_message: "worker shutdown",
    }).eq("id", id);
  }
}
