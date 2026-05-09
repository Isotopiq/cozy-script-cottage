export type Language = "python" | "r" | "bash";
export type OutputType = "text" | "table" | "chart" | "shiny";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type AppRole = "admin" | "viewer";

export interface Category {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface ParamField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default?: string | number | boolean;
  options?: string[];
  required?: boolean;
}

export interface Script {
  id: string;
  slug: string;
  name: string;
  description: string;
  language: Language;
  categoryId: string;
  source: string;
  paramsSchema: ParamField[];
  outputType: OutputType;
  packages: string[];
  timeoutS: number;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  favorite?: boolean;
}

export interface RunLog {
  id: string;
  runId: string;
  ts: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

export interface RunOutput {
  type: OutputType;
  text?: string;
  table?: { columns: string[]; rows: (string | number)[][] };
  chart?: { kind: "line" | "bar"; data: Record<string, number | string>[]; xKey: string; yKeys: string[] };
  shinyUrl?: string;
}

export interface Run {
  id: string;
  scriptId: string;
  triggeredBy: string;
  status: RunStatus;
  params: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  exitCode?: number;
  output?: RunOutput;
}

export interface Worker {
  id: string;
  name: string;
  baseUrl: string;
  status: "online" | "offline" | "degraded";
  lastSeenAt: string;
  capabilities: { python: boolean; r: boolean; docker: boolean };
  queueDepth: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
}
