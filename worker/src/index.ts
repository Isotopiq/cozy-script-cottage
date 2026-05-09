/**
 * Isotopiq Script Hub — VPS Worker
 *
 * Polls the Supabase `runs` table for queued runs, claims one atomically,
 * executes the associated script (python / Rscript / bash), streams stdout
 * and stderr into `run_logs`, and finalizes the run row.
 *
 * Auth: uses the Supabase SERVICE_ROLE key (private VPS only).
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUPABASE_URL = need("SUPABASE_URL");
const SERVICE_ROLE = need("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_ID = need("WORKER_ID");
const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 3000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15000);
const MAX_LOG_LINE = 4000;

function need(k: string): string {
  const v = process.env[k];
  if (!v) { console.error(`Missing env ${k}`); process.exit(1); }
  return v;
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Run = {
  id: string;
  script_id: string;
  params: Record<string, unknown>;
};

type Script = {
  id: string;
  name: string;
  language: "python" | "r" | "bash";
  source: string;
  timeout_s: number;
};

async function heartbeat() {
  await sb.from("workers").update({
    status: "online",
    last_seen_at: new Date().toISOString(),
  }).eq("id", WORKER_ID);
}

async function claimRun(): Promise<Run | null> {
  // Atomic claim: only succeeds if status is still 'queued'.
  const { data: candidate } = await sb
    .from("runs")
    .select("id, script_id, params")
    .eq("status", "queued")
    .is("worker_id", null)
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;

  const { data: claimed, error } = await sb
    .from("runs")
    .update({
      status: "running",
      worker_id: WORKER_ID,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, script_id, params")
    .maybeSingle();
  if (error) { console.error("claim failed", error); return null; }
  return claimed;
}

async function getScript(id: string): Promise<Script | null> {
  const { data, error } = await sb.from("scripts")
    .select("id, name, language, source, timeout_s").eq("id", id).maybeSingle();
  if (error) { console.error(error); return null; }
  return data as Script | null;
}

async function logLine(run_id: string, stream: "stdout" | "stderr" | "system", line: string) {
  if (line.length > MAX_LOG_LINE) line = line.slice(0, MAX_LOG_LINE) + "…[truncated]";
  await sb.from("run_logs").insert({ run_id, stream, line });
}

function cmdFor(lang: Script["language"], file: string): { cmd: string; args: string[] } {
  switch (lang) {
    case "python": return { cmd: "python3", args: [file] };
    case "r":      return { cmd: "Rscript", args: [file] };
    case "bash":   return { cmd: "bash",    args: [file] };
  }
}

function ext(lang: Script["language"]) {
  return lang === "python" ? "py" : lang === "r" ? "R" : "sh";
}

async function executeRun(run: Run) {
  const start = Date.now();
  const script = await getScript(run.script_id);
  if (!script) {
    await sb.from("runs").update({
      status: "failed", error_message: "Script not found",
      finished_at: new Date().toISOString(), duration_ms: Date.now() - start,
    }).eq("id", run.id);
    return;
  }
  await logLine(run.id, "system", `Worker ${WORKER_ID} executing "${script.name}" (${script.language})`);

  const dir = await mkdtemp(join(tmpdir(), "isotopiq-run-"));
  const file = join(dir, `script.${ext(script.language)}`);
  await writeFile(file, script.source);

  const { cmd, args } = cmdFor(script.language, file);
  const env = {
    ...process.env,
    RUN_ID: run.id,
    RUN_PARAMS: JSON.stringify(run.params ?? {}),
  };
  const child = spawn(cmd, args, { cwd: dir, env });
  let exit_code: number | null = null;
  const tail: string[] = [];

  const timer = setTimeout(() => {
    void logLine(run.id, "system", `Timeout after ${script.timeout_s}s — killing process`);
    child.kill("SIGKILL");
  }, script.timeout_s * 1000);

  const pipe = (stream: "stdout" | "stderr", src: NodeJS.ReadableStream) => {
    let buf = "";
    src.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line) { tail.push(line); if (tail.length > 200) tail.shift(); void logLine(run.id, stream, line); }
      }
    });
    src.on("end", () => { if (buf) void logLine(run.id, stream, buf); });
  };
  pipe("stdout", child.stdout);
  pipe("stderr", child.stderr);

  await new Promise<void>((resolve) => {
    child.on("close", (code) => { exit_code = code; clearTimeout(timer); resolve(); });
    child.on("error", (err) => { void logLine(run.id, "system", `spawn error: ${err.message}`); exit_code = -1; resolve(); });
  });

  await rm(dir, { recursive: true, force: true });

  const ok = exit_code === 0;
  await sb.from("runs").update({
    status: ok ? "succeeded" : "failed",
    exit_code,
    duration_ms: Date.now() - start,
    finished_at: new Date().toISOString(),
    output: { tail: tail.slice(-50) },
    error_message: ok ? null : `Exited with code ${exit_code}`,
  }).eq("id", run.id);
  await logLine(run.id, "system", `Run ${ok ? "succeeded" : "failed"} (exit ${exit_code})`);
}

async function loop() {
  console.log(`[isotopiq-worker] starting · id=${WORKER_ID} · poll=${POLL_MS}ms`);
  setInterval(() => { void heartbeat(); }, HEARTBEAT_MS);
  await heartbeat();

  // graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down…");
    await sb.from("workers").update({ status: "offline" }).eq("id", WORKER_ID);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (true) {
    try {
      const run = await claimRun();
      if (run) {
        await executeRun(run);
      } else {
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (err) {
      console.error("loop error", err);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

loop();
