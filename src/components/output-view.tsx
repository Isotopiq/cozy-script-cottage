import type { DBRun } from "@/lib/hooks/use-data";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export function OutputView({ run }: { run: DBRun }) {
  if (run.status === "queued" || run.status === "running") {
    return <p className="font-mono text-xs text-muted-foreground">Run in progress — output appears here once it completes.</p>;
  }
  if (run.status === "failed") {
    return (
      <div className="space-y-2">
        <p className="font-mono text-xs text-destructive">Run failed.</p>
        {run.error_message && <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{run.error_message}</pre>}
      </div>
    );
  }
  if (!run.output) return <p className="font-mono text-xs text-muted-foreground">No output captured.</p>;

  const o = run.output;
  if (o.type === "text") return <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{o.text}</pre>;
  if (o.type === "table" && o.table) {
    return (
      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            <tr>{o.table.columns.map((c: string) => <th key={c} className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{c}</th>)}</tr>
          </thead>
          <tbody>
            {o.table.rows.map((r: any[], i: number) => (
              <tr key={i} className="border-t border-border">
                {r.map((cell, j) => <td key={j} className="px-3 py-2 font-mono text-xs">{String(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (o.type === "chart" && o.chart) {
    const Comp: any = o.chart.kind === "bar" ? BarChart : LineChart;
    const Series: any = o.chart.kind === "bar" ? Bar : Line;
    return (
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <Comp data={o.chart.data}>
            <XAxis dataKey={o.chart.xKey} stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            {o.chart.yKeys.map((k: string, i: number) => (
              <Series key={k} type="monotone" dataKey={k} stroke={`var(--chart-${(i % 5) + 1})`} fill={`var(--chart-${(i % 5) + 1})`} strokeWidth={2} />
            ))}
          </Comp>
        </ResponsiveContainer>
      </div>
    );
  }
  if (o.type === "shiny" && o.shinyUrl) {
    return (
      <iframe src={o.shinyUrl} className="h-[560px] w-full rounded-md border border-border bg-card" title="Shiny app" />
    );
  }
  return null;
}
