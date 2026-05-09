import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LangBadge, StatusPill } from "@/components/status";
import { OutputView } from "@/components/output-view";
import { LogStream } from "@/components/log-stream";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRun, useRunLogs, useScripts } from "@/lib/hooks/use-data";

export const Route = createFileRoute("/_authenticated/runs/$id")({
  head: () => ({ meta: [{ title: "Run — Script Hub" }] }),
  component: RunDetail,
});

function RunDetail() {
  const { id } = useParams({ from: "/_authenticated/runs/$id" });
  const run = useRun(id);
  const logs = useRunLogs(id);
  const { data: scripts } = useScripts();
  if (!run) return <div className="p-10 text-sm text-muted-foreground">Run not found.</div>;
  const script = scripts.find((s) => s.id === run.script_id);

  return (
    <div className="space-y-4 p-6">
      <Link to="/runs" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> All runs
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {script && <LangBadge lang={script.language} />}
            <StatusPill status={run.status} />
          </div>
          <h1 className="font-mono text-2xl tracking-tight">{script?.name ?? run.script_id}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            id: {run.id} · started {new Date(run.started_at).toLocaleString()} · duration {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : "—"}
          </p>
        </div>
        {script && <Link to="/scripts/$slug" params={{ slug: script.slug }} className="text-xs text-primary hover:underline">Open script →</Link>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="space-y-2 p-4">
          <h3 className="font-mono text-sm tracking-tight">Parameters</h3>
          <pre className="overflow-auto rounded bg-[oklch(0.12_0.02_260)] p-3 font-mono text-[11px]">{JSON.stringify(run.params, null, 2) || "{}"}</pre>
          <h3 className="pt-2 font-mono text-sm tracking-tight">Exit</h3>
          <p className="font-mono text-xs text-muted-foreground">code {run.exit_code ?? "—"}</p>
        </Card>
        <Card className="overflow-hidden">
          <Tabs defaultValue="output" className="flex h-full flex-col">
            <TabsList className="m-2 self-start bg-transparent">
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="output" className="p-4"><OutputView run={run} /></TabsContent>
            <TabsContent value="logs" className="p-0"><LogStream logs={logs} /></TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
