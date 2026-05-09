import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Pencil, Star, Trash2, Clock } from "lucide-react";
import { db } from "@/lib/mock-db";
import type { ParamField, RunLog } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LangBadge, StatusPill } from "@/components/status";
import { OutputView } from "@/components/output-view";
import { LogStream } from "@/components/log-stream";

export const Route = createFileRoute("/_authenticated/scripts/$slug")({
  head: () => ({ meta: [{ title: "Script — Script Hub" }] }),
  component: ScriptDetail,
});

function ScriptDetail() {
  const { slug } = useParams({ from: "/_authenticated/scripts/$slug" });
  const nav = useNavigate();
  const [, force] = useState(0);
  useEffect(() => {
    const off = db.runs.onAny(() => force((x) => x + 1));
    const t = setInterval(() => force((x) => x + 1), 800);
    return () => { off(); clearInterval(t); };
  }, []);

  const script = db.scripts.get(slug);
  const [params, setParams] = useState<Record<string, unknown>>(() => {
    const obj: Record<string, unknown> = {};
    script?.paramsSchema.forEach((p) => { if (p.default !== undefined) obj[p.key] = p.default; });
    return obj;
  });
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRun = useMemo(() => activeRunId ? db.runs.get(activeRunId) ?? null : null, [activeRunId]);
  const history = script ? db.runs.listForScript(script.id) : [];

  if (!script) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Script not found. <Link to="/scripts" className="text-primary hover:underline">Back to scripts</Link>
      </div>
    );
  }

  const start = () => {
    const r = db.runs.start(script.id, params);
    setActiveRunId(r.id);
  };
  const cancel = () => activeRun && db.runs.cancel(activeRun.id);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LangBadge lang={script.language} />
            <span className="font-mono text-[10px] uppercase text-muted-foreground">{script.outputType}</span>
          </div>
          <h1 className="font-mono text-3xl tracking-tight">{script.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{script.description}</p>
          <div className="flex flex-wrap gap-1 pt-1">
            {script.tags.map((t) => (
              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono">{t}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => db.scripts.toggleFavorite(script.id)}>
            <Star className="h-4 w-4" fill={script.favorite ? "currentColor" : "none"} />
          </Button>
          <Link to="/scripts/$slug/edit" params={{ slug: script.slug }}>
            <Button variant="outline"><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
          </Link>
          <Button variant="outline" onClick={() => { if (confirm("Delete this script?")) { db.scripts.remove(script.id); nav({ to: "/scripts" }); } }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* LEFT — Parameters & source */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 font-mono text-sm tracking-tight">Parameters</h3>
            {script.paramsSchema.length === 0 ? (
              <p className="text-xs text-muted-foreground">This script takes no parameters.</p>
            ) : (
              <div className="space-y-3">
                {script.paramsSchema.map((p) => (
                  <ParamControl
                    key={p.key} field={p}
                    value={params[p.key]}
                    onChange={(v) => setParams((prev) => ({ ...prev, [p.key]: v }))}
                  />
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {activeRun?.status === "running" ? (
                <Button variant="destructive" className="flex-1" onClick={cancel}>
                  <Square className="mr-1 h-4 w-4" /> Cancel
                </Button>
              ) : (
                <Button className="flex-1" onClick={start}>
                  <Play className="mr-1 h-4 w-4" /> Run script
                </Button>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>timeout: {script.timeoutS}s</span>
              <span>packages: {script.packages.length}</span>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 font-mono text-sm tracking-tight">Run history</h3>
            <div className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
              {history.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
              {history.slice(0, 20).map((r) => (
                <button
                  key={r.id} onClick={() => setActiveRunId(r.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-secondary/60 ${activeRunId === r.id ? "bg-secondary" : ""}`}
                >
                  <span className="flex items-center gap-2 font-mono text-[11px]">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {new Date(r.startedAt).toLocaleString()}
                  </span>
                  <StatusPill status={r.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT — output / logs / source */}
        <Card className="overflow-hidden">
          <Tabs defaultValue="output" className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4">
              <TabsList className="bg-transparent">
                <TabsTrigger value="output">Output</TabsTrigger>
                <TabsTrigger value="logs">Live logs</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
              </TabsList>
              {activeRun && <StatusPill status={activeRun.status} />}
            </div>
            <TabsContent value="output" className="flex-1 p-4">
              {activeRun ? <OutputView run={activeRun} /> : <Empty hint="Run the script to see output here." />}
            </TabsContent>
            <TabsContent value="logs" className="flex-1 p-0">
              {activeRun ? <LogStreamForRun runId={activeRun.id} /> : <Empty hint="Run logs will stream here." />}
            </TabsContent>
            <TabsContent value="source" className="flex-1 p-0">
              <pre className="m-0 max-h-[600px] overflow-auto bg-[oklch(0.12_0.02_260)] p-4 font-mono text-xs leading-relaxed scroll-thin">
                <code>{script.source}</code>
              </pre>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center text-center">
      <p className="font-mono text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function LogStreamForRun({ runId }: { runId: string }) {
  const [logs, setLogs] = useState<RunLog[]>(() => db.runs.logs(runId));
  useEffect(() => {
    setLogs(db.runs.logs(runId));
    const off = db.runs.onLog(({ runId: rid, log }) => {
      if (rid === runId) setLogs((prev) => [...prev, log]);
    });
    return () => { off(); };
  }, [runId]);
  return <LogStream logs={logs} />;
}

function ParamControl({ field, value, onChange }: { field: ParamField; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{field.label}</Label>
      {field.type === "string" && <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />}
      {field.type === "number" && <Input type="number" value={(value as number) ?? ""} onChange={(e) => onChange(Number(e.target.value))} />}
      {field.type === "boolean" && (
        <div className="flex items-center gap-2"><Switch checked={!!value} onCheckedChange={onChange} /><span className="text-xs text-muted-foreground">{value ? "true" : "false"}</span></div>
      )}
      {field.type === "select" && (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
