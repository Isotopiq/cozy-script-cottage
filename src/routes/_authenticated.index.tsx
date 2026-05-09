import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, XCircle, PlayCircle, ServerCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill, LangBadge } from "@/components/status";
import { useScripts, useRuns, useWorkers } from "@/lib/hooks/use-data";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Script Hub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: runs } = useRuns();
  const { data: scripts } = useScripts();
  const { data: workers } = useWorkers();
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running" || r.status === "queued").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-3xl tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">A live view of your script catalog and recent runs.</p>
        </div>
        <Link to="/scripts" className="text-xs font-mono text-muted-foreground hover:text-foreground">View all scripts →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<PlayCircle className="h-4 w-4" />} label="Total runs" value={runs.length} accent="text-foreground" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Succeeded" value={succeeded} accent="text-success" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="Failed" value={failed} accent="text-destructive" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Active" value={running} accent="text-accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="col-span-2 p-5">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Recent runs</h3>
          <div className="space-y-1.5">
            {runs.slice(0, 10).map((r) => {
              const s = scripts.find((x) => x.id === r.script_id);
              return (
                <Link key={r.id} to="/runs/$id" params={{ id: r.id }}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary/50">
                  <div className="flex min-w-0 items-center gap-2">
                    {s && <LangBadge lang={s.language} />}
                    <span className="truncate text-sm">{s?.name ?? "unknown"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground">{new Date(r.started_at).toLocaleTimeString()}</span>
                    <StatusPill status={r.status} />
                  </div>
                </Link>
              );
            })}
            {runs.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-mono text-sm tracking-tight">
            <ServerCog className="h-4 w-4" /> Workers
          </h3>
          <div className="space-y-3">
            {workers.length === 0 && <p className="text-xs text-muted-foreground">No workers connected. Deploy the worker on your VPS.</p>}
            {workers.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm">{w.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">queue: {w.queue_depth}</div>
                </div>
                <span className={`text-[10px] font-mono uppercase ${w.status === "online" ? "text-success" : "text-muted-foreground"}`}>● {w.status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-mono text-sm tracking-tight">Top scripts</h3>
        <div className="grid gap-1.5 md:grid-cols-2">
          {[...scripts].sort((a, b) => b.run_count - a.run_count).slice(0, 8).map((s) => (
            <Link key={s.id} to="/scripts/$slug" params={{ slug: s.slug }}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary/50">
              <div className="flex min-w-0 items-center gap-2">
                <LangBadge lang={s.language} />
                <span className="truncate text-sm">{s.name}</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{s.run_count} runs</span>
            </Link>
          ))}
          {scripts.length === 0 && <p className="text-xs text-muted-foreground">No scripts yet. Create one from the Scripts page.</p>}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className={`mt-2 font-mono text-3xl tracking-tight ${accent}`}>{value}</div>
    </Card>
  );
}
