import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Play, Pencil, Trash2, Clock } from "lucide-react";
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
import { useScript, useRuns, useRun, useRunLogs } from "@/lib/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scripts/$slug")({
  head: () => ({ meta: [{ title: "Script — Script Hub" }] }),
  component: ScriptDetail,
});

function ScriptDetail() {
  const { slug } = useParams({ from: "/_authenticated/scripts/$slug" });
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const { data: script, loading } = useScript(slug);
  const { data: allRuns } = useRuns();
  const history = useMemo(() => script ? allRuns.filter((r) => r.script_id === script.id) : [], [script, allRuns]);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRun = useRun(activeRunId ?? "");

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!script) return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Script not found. <Link to="/scripts" className="text-primary hover:underline">Back to scripts</Link>
    </div>
  );

  const start = async () => {
    const merged: Record<string, unknown> = {};
    script.params_schema.forEach((p) => { if (p.default !== undefined) merged[p.key] = p.default; });
    Object.assign(merged, params);
    const { data, error } = await supabase.from("runs").insert({
      script_id: script.id, triggered_by: user!.id, status: "queued", params: merged,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setActiveRunId(data.id);
    toast.success("Queued — waiting for a worker to pick it up.");
  };

  const remove = async () => {
    if (!confirm("Delete this script?")) return;
    const { error } = await supabase.from("scripts").delete().eq("id", script.id);
    if (error) { toast.error(error.message); return; }
    nav({ to: "/scripts" });
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LangBadge lang={script.language} />
            <span className="font-mono text-[10px] uppercase text-muted-foreground">{script.output_type}</span>
          </div>
          <h1 className="font-mono text-3xl tracking-tight">{script.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{script.description}</p>
          <div className="flex flex-wrap gap-1 pt-1">
            {script.tags.map((t) => (
              <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono">{t}</span>
            ))}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link to="/scripts/$slug/edit" params={{ slug: script.slug }}>
              <Button variant="outline"><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
            </Link>
            <Button variant="outline" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 font-mono text-sm tracking-tight">Parameters</h3>
            {script.params_schema.length === 0 ? (
              <p className="text-xs text-muted-foreground">This script takes no parameters.</p>
            ) : (
              <div className="space-y-3">
                {script.params_schema.map((p) => (
                  <ParamControl key={p.key} field={p} value={params[p.key]} onChange={(v) => setParams((prev) => ({ ...prev, [p.key]: v }))} />
                ))}
              </div>
            )}
            <Button className="mt-4 w-full" onClick={start}><Play className="mr-1 h-4 w-4" /> Run script</Button>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>timeout: {script.timeout_s}s</span>
              <span>packages: {script.packages.length}</span>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 font-mono text-sm tracking-tight">Run history</h3>
            <div className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
              {history.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
              {history.slice(0, 20).map((r) => (
                <button key={r.id} onClick={() => setActiveRunId(r.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-secondary/60 ${activeRunId === r.id ? "bg-secondary" : ""}`}>
                  <span className="flex items-center gap-2 font-mono text-[11px]">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {new Date(r.started_at).toLocaleString()}
                  </span>
                  <StatusPill status={r.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>

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
              {activeRunId ? <LogStreamForRun runId={activeRunId} /> : <Empty hint="Run logs will stream here." />}
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
  return <div className="flex h-full min-h-[300px] items-center justify-center text-center"><p className="font-mono text-xs text-muted-foreground">{hint}</p></div>;
}

function LogStreamForRun({ runId }: { runId: string }) {
  const logs = useRunLogs(runId);
  return <LogStream logs={logs} />;
}

function ParamControl({ field, value, onChange }: { field: any; value: unknown; onChange: (v: unknown) => void }) {
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
          <SelectContent>{field.options?.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}
