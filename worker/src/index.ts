/**
 * Isotopiq Script Hub — VPS Worker
 *
 * Polls the Supabase `runs` table for queued runs, claims one atomically,
 * executes the associated script (python / Rscript / bash), streams stdout
 * and stderr into `run_logs`, finalizes the run row, AND samples host
 * resource metrics (CPU / memory / disk / network) into `worker_metrics`.
 *
 * Auth: uses the Supabase SERVICE_ROLE key (private VPS only).
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import os from "node:os";
import { join } from "node:path";

const SUPABASE_URL = need("SUPABASE_URL");
const SERVICE_ROLE = need("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_ID = need("WORKER_ID");
const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 3000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15000);
const METRICS_MS = Number(process.env.METRICS_INTERVAL_MS ?? 5000);
const MAX_LOG_LINE = 4000;
// Optional opt-in: comma-separated env var names to forward into spawned
// scripts beyond the default safe allowlist. Never include secrets here.
const EXTRA_ENV_ALLOWLIST = (process.env.EXTRA_ENV_ALLOWLIST ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Names that must never be forwarded even if listed in EXTRA_ENV_ALLOWLIST.
const ENV_BLOCKLIST = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "WORKER_ID",
]);

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
  // SECURITY: Build an explicit allowlist environment for the child process.
  // Never spread process.env — that would leak SUPABASE_SERVICE_ROLE_KEY,
  // SUPABASE_URL, WORKER_ID, and any other host secrets into user scripts.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
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

// ============================================================
// Resource metrics sampler — Linux /proc-based, best-effort.
// ============================================================

type CpuSnap = { idle: number; total: number };
type NetSnap = { rx: number; tx: number; t: number };

let prevCpu: CpuSnap | null = null;
let prevNet: NetSnap | null = null;
let metricInsertCount = 0;

async function readCpu(): Promise<CpuSnap | null> {
  try {
    const text = await readFile("/proc/stat", "utf8");
    const line = text.split("\n").find((l) => l.startsWith("cpu "));
    if (!line) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  } catch { return null; }
}

async function readMem(): Promise<{ used_mb: number; total_mb: number } | null> {
  try {
    const text = await readFile("/proc/meminfo", "utf8");
    const kv: Record<string, number> = {};
    for (const line of text.split("\n")) {
      const m = /^(\w+):\s+(\d+)\s*kB/.exec(line);
      if (m) kv[m[1]] = Number(m[2]);
    }
    const total = kv.MemTotal ?? 0;
    const avail = kv.MemAvailable ?? kv.MemFree ?? 0;
    return { total_mb: total / 1024, used_mb: (total - avail) / 1024 };
  } catch { return null; }
}

async function readDisk(): Promise<{ used_gb: number; total_gb: number } | null> {
  try {
    const s = await statfs("/");
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total_gb: total / 1024 ** 3, used_gb: (total - free) / 1024 ** 3 };
  } catch { return null; }
}

async function readNet(): Promise<NetSnap | null> {
  try {
    const text = await readFile("/proc/net/dev", "utf8");
    let rx = 0, tx = 0;
    for (const line of text.split("\n")) {
      const m = /^\s*([^:]+):\s*(.+)$/.exec(line);
      if (!m) continue;
      const iface = m[1].trim();
      if (iface === "lo") continue;
      const cols = m[2].trim().split(/\s+/).map(Number);
      rx += cols[0] ?? 0;
      tx += cols[8] ?? 0;
    }
    return { rx, tx, t: Date.now() };
  } catch { return null; }
}

async function sampleMetrics() {
  try {
    const [cpu, mem, disk, net] = await Promise.all([readCpu(), readMem(), readDisk(), readNet()]);

    let cpu_pct: number | null = null;
    if (cpu && prevCpu) {
      const dt = cpu.total - prevCpu.total;
      const di = cpu.idle - prevCpu.idle;
      if (dt > 0) cpu_pct = Math.max(0, Math.min(100, ((dt - di) / dt) * 100));
    }
    prevCpu = cpu ?? prevCpu;

    let net_rx_bps: number | null = null;
    let net_tx_bps: number | null = null;
    if (net && prevNet) {
      const dt = (net.t - prevNet.t) / 1000;
      if (dt > 0) {
        net_rx_bps = Math.max(0, (net.rx - prevNet.rx) / dt);
        net_tx_bps = Math.max(0, (net.tx - prevNet.tx) / dt);
      }
    }
    prevNet = net ?? prevNet;

    // Skip first tick (no deltas yet)
    if (cpu_pct === null && net_rx_bps === null) return;

    const row = {
      worker_id: WORKER_ID,
      cpu_pct,
      mem_used_mb: mem?.used_mb ?? null,
      mem_total_mb: mem?.total_mb ?? null,
      disk_used_gb: disk?.used_gb ?? null,
      disk_total_gb: disk?.total_gb ?? null,
      net_rx_bps,
      net_tx_bps,
      load_1m: os.loadavg()[0] ?? null,
    };
    const { error } = await sb.from("worker_metrics").insert(row);
    if (error) { console.error("metrics insert", error.message); return; }

    metricInsertCount++;
    if (metricInsertCount % 100 === 0) {
      await sb.rpc("prune_worker_metrics");
    }
  } catch (err) {
    console.error("sampleMetrics error", err);
  }
}

async function loop() {
  console.log(`[isotopiq-worker] starting · id=${WORKER_ID} · poll=${POLL_MS}ms · metrics=${METRICS_MS}ms`);
  setInterval(() => { void heartbeat(); }, HEARTBEAT_MS);
  setInterval(() => { void sampleMetrics(); }, METRICS_MS);
  await heartbeat();
  await sampleMetrics(); // prime prev snapshots

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
