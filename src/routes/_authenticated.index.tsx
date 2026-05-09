import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, PlayCircle, ServerCog } from "lucide-react";
import { db } from "@/lib/mock-db";
import { Card } from "@/components/ui/card";
import { StatusPill, LangBadge } from "@/components/status";
import { Link } from "@tanstack/react-router";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Script Hub" }] }),
  beforeLoad: () => {
    if (typeof window !== "undefined" && !db.auth.current()) throw redirect({ to: "/login" });
  },
  component: Dashboard,
});

function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const off = db.runs.onAny(() => set((x) => x + 1));
    return () => { off(); };
  }, []);
}

function Dashboard() {
  useTick();
  const runs = db.runs.list();
  const scripts = db.scripts.list();
  const workers = db.workers.list();
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running").length;

  // Run volume per "day" (mocked from index)
  const volume = Array.from({ length: 7 }).map((_, i) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
    runs: Math.max(1, ((runs.length + i * 3) % 9) + 2),
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-3xl tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">A live view of your script catalog and recent runs.</p>
        </div>
        <Link to="/scripts" className="text-xs font-mono text-muted-foreground hover:text-foreground">
          View all scripts →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<PlayCircle className="h-4 w-4" />} label="Total runs" value={runs.length} accent="text-foreground" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Succeeded" value={succeeded} accent="text-success" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="Failed" value={failed} accent="text-destructive" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Running" value={running} accent="text-accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="col-span-2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-sm tracking-tight">Run volume — last 7 days</h3>
            <span className="font-mono text-[11px] text-muted-foreground">mock</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume}>
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="runs" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-mono text-sm tracking-tight">
            <ServerCog className="h-4 w-4" /> Workers
          </h3>
          <div className="space-y-3">
            {workers.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm">{w.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{w.baseUrl}</div>
                </div>
                <span className={`text-[10px] font-mono uppercase ${w.status === "online" ? "text-success" : "text-muted-foreground"}`}>
                  ● {w.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Recent runs</h3>
          <div className="space-y-1.5">
            {runs.slice(0, 8).map((r) => {
              const s = scripts.find((x) => x.id === r.scriptId);
              return (
                <Link
                  key={r.id} to="/runs/$id" params={{ id: r.id }}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary/50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {s && <LangBadge lang={s.language} />}
                    <span className="truncate text-sm">{s?.name ?? "unknown"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(r.startedAt).toLocaleTimeString()}
                    </span>
                    <StatusPill status={r.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Top scripts</h3>
          <div className="space-y-1.5">
            {[...scripts].sort((a, b) => b.runCount - a.runCount).slice(0, 8).map((s) => (
              <Link
                key={s.id} to="/scripts/$slug" params={{ slug: s.slug }}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <LangBadge lang={s.language} />
                  <span className="truncate text-sm">{s.name}</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{s.runCount} runs</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
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
