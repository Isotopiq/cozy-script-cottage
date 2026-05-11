import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { ArrowLeft } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/workers/$id")({
  head: () => ({ meta: [{ title: "Worker monitor — Isotopiq" }] }),
  component: WorkerMonitor,
});

type Metric = {
  id: number;
  worker_id: string;
  ts: string;
  cpu_pct: number | null;
  mem_used_mb: number | null;
  mem_total_mb: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  net_rx_bps: number | null;
  net_tx_bps: number | null;
  load_1m: number | null;
};

type WorkerRow = { id: string; name: string; status: string; last_seen_at: string | null };

const RANGES: { label: string; minutes: number }[] = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
];

function fmtBps(b: number | null) {
  if (b == null) return "—";
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB/s`;
  if (b > 1024) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${b.toFixed(0)} B/s`;
}

function downsample<T extends { ts: string }>(rows: T[], maxPoints = 240): T[] {
  if (rows.length <= maxPoints) return rows;
  const bucket = Math.ceil(rows.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += bucket) out.push(rows[i]);
  return out;
}

function WorkerMonitor() {
  const { id } = Route.useParams();
  const [worker, setWorker] = useState<WorkerRow | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [rangeMin, setRangeMin] = useState(60);
  const [loading, setLoading] = useState(true);

  // Fetch worker meta
  useEffect(() => {
    let cancelled = false;
    supabase.from("workers").select("id,name,status,last_seen_at").eq("id", id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setWorker(data as WorkerRow | null); });
    return () => { cancelled = true; };
  }, [id]);

  // Fetch initial metrics + subscribe to realtime inserts
  useEffect(() => {
    setLoading(true);
    const since = new Date(Date.now() - rangeMin * 60_000).toISOString();
    let cancelled = false;
    supabase
      .from("worker_metrics")
      .select("*")
      .eq("worker_id", id)
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit(5000)
      .then(({ data }) => {
        if (cancelled) return;
        setMetrics((data ?? []) as Metric[]);
        setLoading(false);
      });

    const ch = supabase
      .channel(`worker_metrics:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "worker_metrics", filter: `worker_id=eq.${id}` },
        (payload) => {
          const row = payload.new as Metric;
          setMetrics((prev) => {
            const cutoff = Date.now() - rangeMin * 60_000;
            const next = [...prev, row].filter((m) => new Date(m.ts).getTime() >= cutoff);
            return next;
          });
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [id, rangeMin]);

  const points = useMemo(() => {
    const ds = downsample(metrics);
    return ds.map((m) => ({
      t: new Date(m.ts).getTime(),
      tLabel: new Date(m.ts).toLocaleTimeString(),
      cpu: m.cpu_pct ?? 0,
      memPct: m.mem_total_mb ? ((m.mem_used_mb ?? 0) / m.mem_total_mb) * 100 : 0,
      memUsed: m.mem_used_mb ?? 0,
      memTotal: m.mem_total_mb ?? 0,
      diskPct: m.disk_total_gb ? ((m.disk_used_gb ?? 0) / m.disk_total_gb) * 100 : 0,
      diskUsed: m.disk_used_gb ?? 0,
      diskTotal: m.disk_total_gb ?? 0,
      rx: m.net_rx_bps ?? 0,
      tx: m.net_tx_bps ?? 0,
      load: m.load_1m ?? 0,
    }));
  }, [metrics]);

  const latest = points.at(-1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/workers"><ArrowLeft className="h-4 w-4 mr-1" />Workers</Link>
          </Button>
          <div>
            <h2 className="font-mono text-lg">{worker?.name ?? "—"}</h2>
            <p className="text-[11px] text-muted-foreground font-mono">
              {worker?.status ?? "—"} · last seen {worker?.last_seen_at ? new Date(worker.last_seen_at).toLocaleTimeString() : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.minutes}
              size="sm"
              variant={r.minutes === rangeMin ? "default" : "outline"}
              onClick={() => setRangeMin(r.minutes)}
            >{r.label}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="CPU" value={latest ? `${latest.cpu.toFixed(1)}%` : "—"} sub={latest ? `load ${latest.load.toFixed(2)}` : ""} />
        <StatTile label="Memory" value={latest ? `${latest.memPct.toFixed(0)}%` : "—"} sub={latest ? `${(latest.memUsed/1024).toFixed(1)} / ${(latest.memTotal/1024).toFixed(1)} GB` : ""} />
        <StatTile label="Disk" value={latest ? `${latest.diskPct.toFixed(0)}%` : "—"} sub={latest ? `${latest.diskUsed.toFixed(1)} / ${latest.diskTotal.toFixed(1)} GB` : ""} />
        <StatTile label="Network" value={latest ? `↓ ${fmtBps(latest.rx)}` : "—"} sub={latest ? `↑ ${fmtBps(latest.tx)}` : ""} />
      </div>

      {loading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Loading metrics…</Card>
      ) : metrics.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No metrics yet. The worker samples every 5s — make sure it is online and the <code className="font-mono">worker_metrics</code> table exists (run <code className="font-mono">worker/sql/worker_metrics.sql</code>).
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="CPU %" data={points} dataKey="cpu" color="var(--chart-1)" unit="%" domain={[0, 100]} />
          <ChartCard title="Memory %" data={points} dataKey="memPct" color="var(--chart-2)" unit="%" domain={[0, 100]} />
          <ChartCard title="Disk %" data={points} dataKey="diskPct" color="var(--chart-3)" unit="%" domain={[0, 100]} />
          <NetChartCard title="Network (rx / tx)" data={points} />
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
      {sub && <p className="font-mono text-[11px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function ChartCard({
  title, data, dataKey, color, unit, domain,
}: {
  title: string;
  data: Array<Record<string, number | string>>;
  dataKey: string;
  color: string;
  unit?: string;
  domain?: [number, number];
}) {
  return (
    <Card className="p-4">
      <p className="mb-2 font-mono text-xs">{title}</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="tLabel" tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} domain={domain ?? ["auto", "auto"]} unit={unit} />
            <Tooltip
              contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", fontSize: 11 }}
              formatter={(v: number) => (unit ? `${v.toFixed(1)}${unit}` : v.toFixed(2))}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#g-${dataKey})`} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function NetChartCard({ title, data }: { title: string; data: Array<Record<string, number | string>> }) {
  return (
    <Card className="p-4">
      <p className="mb-2 font-mono text-xs">{title}</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="g-rx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="g-tx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="tLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => v > 1024*1024 ? `${(v/1024/1024).toFixed(1)}M` : v > 1024 ? `${(v/1024).toFixed(0)}K` : `${v}`} />
            <Tooltip
              contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", fontSize: 11 }}
              formatter={(v: number, name: string) => [fmtBps(v), name === "rx" ? "↓ rx" : "↑ tx"]}
            />
            <Area type="monotone" dataKey="rx" stroke="var(--chart-4)" fill="url(#g-rx)" strokeWidth={1.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="tx" stroke="var(--chart-5)" fill="url(#g-tx)" strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
