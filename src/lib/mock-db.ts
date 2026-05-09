import { nanoid } from "nanoid";
import type {
  AuthUser, Category, Run, RunLog, RunOutput, RunStatus, Script, Worker,
} from "./types";

type Listener<T> = (value: T) => void;
class Emitter<T> {
  private ls = new Set<Listener<T>>();
  on(l: Listener<T>) { this.ls.add(l); return () => this.ls.delete(l); }
  emit(v: T) { this.ls.forEach((l) => l(v)); }
}

const now = () => new Date().toISOString();

// ---------- Seed ----------
const cats: Category[] = [
  { id: "c1", name: "Data Ops", slug: "data-ops", color: "var(--chart-1)" },
  { id: "c2", name: "Analytics", slug: "analytics", color: "var(--chart-2)" },
  { id: "c3", name: "ML", slug: "ml", color: "var(--chart-3)" },
  { id: "c4", name: "Reporting", slug: "reporting", color: "var(--chart-4)" },
  { id: "c5", name: "Utilities", slug: "utilities", color: "var(--chart-5)" },
];

const sampleScripts: Script[] = [
  {
    id: "s1", slug: "csv-cleaner", name: "CSV Cleaner",
    description: "Strip empty rows, normalize headers, and dedupe a CSV file.",
    language: "python", categoryId: "c1",
    source: `import pandas as pd, sys\ndf = pd.read_csv(sys.argv[1])\ndf.columns = [c.strip().lower() for c in df.columns]\ndf = df.dropna(how="all").drop_duplicates()\nprint(df.head().to_string())\n`,
    paramsSchema: [
      { key: "path", label: "CSV path", type: "string", required: true, default: "data.csv" },
      { key: "dropna", label: "Drop NA", type: "boolean", default: true },
    ],
    outputType: "table", packages: ["pandas"], timeoutS: 60,
    tags: ["csv", "cleanup"], createdBy: "you",
    createdAt: now(), updatedAt: now(), runCount: 14,
  },
  {
    id: "s2", slug: "weekly-revenue", name: "Weekly Revenue",
    description: "Aggregate weekly revenue and produce a line chart.",
    language: "python", categoryId: "c2",
    source: `import pandas as pd\n# fetch ...\nprint("ok")\n`,
    paramsSchema: [
      { key: "weeks", label: "Weeks back", type: "number", default: 12 },
    ],
    outputType: "chart", packages: ["pandas"], timeoutS: 120,
    tags: ["finance", "chart"], createdBy: "you",
    createdAt: now(), updatedAt: now(), runCount: 33,
  },
  {
    id: "s3", slug: "churn-model", name: "Churn Model Trainer",
    description: "Train a churn classifier and report metrics.",
    language: "python", categoryId: "c3",
    source: `from sklearn.ensemble import RandomForestClassifier\nprint("training...")\n`,
    paramsSchema: [
      { key: "estimators", label: "Estimators", type: "number", default: 200 },
    ],
    outputType: "text", packages: ["scikit-learn", "pandas"], timeoutS: 600,
    tags: ["ml", "classification"], createdBy: "you",
    createdAt: now(), updatedAt: now(), runCount: 5,
  },
  {
    id: "s4", slug: "qbr-report", name: "QBR Report",
    description: "Generate a quarterly business review PDF.",
    language: "r", categoryId: "c4",
    source: `library(ggplot2)\nprint("rendering report")\n`,
    paramsSchema: [
      { key: "quarter", label: "Quarter", type: "select", options: ["Q1", "Q2", "Q3", "Q4"], default: "Q2" },
    ],
    outputType: "text", packages: ["ggplot2", "rmarkdown"], timeoutS: 300,
    tags: ["report", "pdf"], createdBy: "you",
    createdAt: now(), updatedAt: now(), runCount: 8,
  },
  {
    id: "s5", slug: "shiny-explorer", name: "Shiny Data Explorer",
    description: "Interactive data exploration app with sliders and plots.",
    language: "r", categoryId: "c2",
    source: `library(shiny)\nui <- fluidPage("Hello")\nserver <- function(input, output) {}\nshinyApp(ui, server)\n`,
    paramsSchema: [],
    outputType: "shiny", packages: ["shiny", "ggplot2"], timeoutS: 1800,
    tags: ["shiny", "interactive"], createdBy: "you",
    createdAt: now(), updatedAt: now(), runCount: 12,
  },
  {
    id: "s6", slug: "disk-usage", name: "Disk Usage Snapshot",
    description: "Summarize disk usage by directory.",
    language: "bash", categoryId: "c5",
    source: `du -sh ~/* | sort -h\n`,
    paramsSchema: [], outputType: "text", packages: [], timeoutS: 30,
    tags: ["sys", "ops"], createdBy: "you",
    createdAt: now(), updatedAt: now(), runCount: 21,
  },
];

const seedRuns: Run[] = (() => {
  const rs: Run[] = [];
  const statuses: RunStatus[] = ["succeeded", "succeeded", "failed", "succeeded", "canceled"];
  for (let i = 0; i < 18; i++) {
    const s = sampleScripts[i % sampleScripts.length];
    const status = statuses[i % statuses.length];
    const started = new Date(Date.now() - (i + 1) * 3600 * 1000).toISOString();
    rs.push({
      id: `r${i}`, scriptId: s.id, triggeredBy: "you", status,
      params: {}, startedAt: started,
      finishedAt: new Date(Date.now() - (i + 1) * 3600 * 1000 + 12000).toISOString(),
      durationMs: 8000 + (i * 1700) % 30000,
      exitCode: status === "succeeded" ? 0 : status === "failed" ? 1 : 130,
      output: status === "succeeded" ? { type: "text", text: "Run completed successfully." } : undefined,
    });
  }
  return rs;
})();

const seedWorkers: Worker[] = [
  {
    id: "w1", name: "primary-worker", baseUrl: "https://worker.example.com",
    status: "offline", lastSeenAt: now(),
    capabilities: { python: true, r: true, docker: true }, queueDepth: 0,
  },
];

// ---------- Store ----------
type Store = {
  auth: AuthUser | null;
  scripts: Script[];
  categories: Category[];
  runs: Run[];
  logs: Record<string, RunLog[]>;
  workers: Worker[];
};

const KEY = "scripthub-mock-v1";
const initial: Store = {
  auth: null,
  scripts: sampleScripts,
  categories: cats,
  runs: seedRuns,
  logs: {},
  workers: seedWorkers,
};

const load = (): Store => {
  if (typeof window === "undefined") return structuredClone(initial);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(initial);
    return JSON.parse(raw) as Store;
  } catch {
    return structuredClone(initial);
  }
};

const store: Store = load();
const persist = () => {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(store));
};

const changes = new Emitter<keyof Store>();
const logEvents = new Emitter<{ runId: string; log: RunLog }>();
const runEvents = new Emitter<Run>();

export const db = {
  // -------- auth --------
  auth: {
    current: () => store.auth,
    onChange: (l: Listener<AuthUser | null>) =>
      changes.on((k) => k === "auth" && l(store.auth)),
    async signUp(email: string, password: string, name: string) {
      void password;
      store.auth = { id: nanoid(8), email, name, role: "admin" };
      persist(); changes.emit("auth");
      return store.auth;
    },
    async signIn(email: string, password: string) {
      void password;
      store.auth = { id: nanoid(8), email, name: email.split("@")[0], role: "admin" };
      persist(); changes.emit("auth");
      return store.auth;
    },
    async signOut() {
      store.auth = null; persist(); changes.emit("auth");
    },
  },

  // -------- categories --------
  categories: {
    list: () => [...store.categories],
    create(name: string, color = "var(--chart-1)") {
      const c: Category = { id: nanoid(6), name, slug: name.toLowerCase().replace(/\s+/g, "-"), color };
      store.categories.push(c); persist(); changes.emit("categories"); return c;
    },
    remove(id: string) {
      store.categories = store.categories.filter((c) => c.id !== id);
      persist(); changes.emit("categories");
    },
  },

  // -------- scripts --------
  scripts: {
    list: () => [...store.scripts],
    get: (slug: string) => store.scripts.find((s) => s.slug === slug),
    getById: (id: string) => store.scripts.find((s) => s.id === id),
    create(input: Omit<Script, "id" | "createdAt" | "updatedAt" | "runCount" | "createdBy">) {
      const s: Script = {
        ...input, id: nanoid(8), createdAt: now(), updatedAt: now(),
        runCount: 0, createdBy: store.auth?.email ?? "anon",
      };
      store.scripts.unshift(s); persist(); changes.emit("scripts"); return s;
    },
    update(id: string, patch: Partial<Script>) {
      const i = store.scripts.findIndex((s) => s.id === id);
      if (i < 0) return;
      store.scripts[i] = { ...store.scripts[i], ...patch, updatedAt: now() };
      persist(); changes.emit("scripts");
    },
    remove(id: string) {
      store.scripts = store.scripts.filter((s) => s.id !== id);
      persist(); changes.emit("scripts");
    },
    toggleFavorite(id: string) {
      const s = store.scripts.find((x) => x.id === id);
      if (!s) return;
      s.favorite = !s.favorite; persist(); changes.emit("scripts");
    },
  },

  // -------- runs --------
  runs: {
    list: () => [...store.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    listForScript: (scriptId: string) =>
      store.runs.filter((r) => r.scriptId === scriptId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    get: (id: string) => store.runs.find((r) => r.id === id),
    onAny: (l: Listener<Run>) => runEvents.on(l),
    onLog: (l: Listener<{ runId: string; log: RunLog }>) => logEvents.on(l),
    logs: (runId: string) => store.logs[runId] ?? [],

    /** Start a simulated run that streams logs and produces a mock output. */
    start(scriptId: string, params: Record<string, unknown>): Run {
      const script = store.scripts.find((s) => s.id === scriptId)!;
      const run: Run = {
        id: nanoid(10), scriptId, triggeredBy: store.auth?.email ?? "anon",
        status: "running", params, startedAt: now(),
      };
      store.runs.unshift(run);
      store.logs[run.id] = [];
      script.runCount += 1;
      persist(); changes.emit("runs"); runEvents.emit(run);

      const lines = mockLines(script, params);
      let i = 0;
      const interval = window.setInterval(() => {
        if (i >= lines.length) {
          window.clearInterval(interval);
          run.status = "succeeded";
          run.finishedAt = now();
          run.durationMs = Date.now() - new Date(run.startedAt).getTime();
          run.exitCode = 0;
          run.output = mockOutput(script);
          persist(); changes.emit("runs"); runEvents.emit(run);
          return;
        }
        const log: RunLog = {
          id: nanoid(6), runId: run.id, ts: now(),
          stream: lines[i].stream, line: lines[i].line,
        };
        store.logs[run.id].push(log);
        logEvents.emit({ runId: run.id, log });
        i++;
      }, 350);

      return run;
    },

    cancel(id: string) {
      const r = store.runs.find((x) => x.id === id);
      if (!r || r.status !== "running") return;
      r.status = "canceled"; r.finishedAt = now();
      r.durationMs = Date.now() - new Date(r.startedAt).getTime();
      persist(); changes.emit("runs"); runEvents.emit(r);
    },
  },

  // -------- workers --------
  workers: {
    list: () => [...store.workers],
    create(name: string, baseUrl: string) {
      const w: Worker = {
        id: nanoid(6), name, baseUrl, status: "offline", lastSeenAt: now(),
        capabilities: { python: true, r: true, docker: true }, queueDepth: 0,
      };
      store.workers.push(w); persist(); changes.emit("workers"); return w;
    },
    remove(id: string) {
      store.workers = store.workers.filter((w) => w.id !== id);
      persist(); changes.emit("workers");
    },
  },
};

function mockLines(script: Script, params: Record<string, unknown>) {
  const out: { stream: "stdout" | "stderr" | "system"; line: string }[] = [];
  out.push({ stream: "system", line: `[worker] starting ${script.language} runner for ${script.slug}` });
  out.push({ stream: "system", line: `[worker] params=${JSON.stringify(params)}` });
  if (script.packages.length) {
    out.push({ stream: "stdout", line: `Loading packages: ${script.packages.join(", ")}` });
  }
  out.push({ stream: "stdout", line: "Reading inputs..." });
  out.push({ stream: "stdout", line: "Processing 1,243 records" });
  out.push({ stream: "stdout", line: "..." });
  out.push({ stream: "stdout", line: "Done in 2.31s" });
  out.push({ stream: "system", line: "[worker] exit 0" });
  return out;
}

function mockOutput(script: Script): RunOutput {
  switch (script.outputType) {
    case "table":
      return {
        type: "table",
        table: {
          columns: ["id", "name", "value"],
          rows: Array.from({ length: 6 }, (_, i) => [i + 1, `row-${i + 1}`, Math.round(Math.random() * 1000)]),
        },
      };
    case "chart":
      return {
        type: "chart",
        chart: {
          kind: "line", xKey: "week", yKeys: ["revenue"],
          data: Array.from({ length: 12 }, (_, i) => ({ week: `W${i + 1}`, revenue: 8000 + Math.round(Math.random() * 6000) })),
        },
      };
    case "shiny":
      return { type: "shiny", shinyUrl: "about:blank" };
    default:
      return { type: "text", text: "Run completed successfully.\nProcessed 1,243 records in 2.31s." };
  }
}
