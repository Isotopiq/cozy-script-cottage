import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useWorkers } from "@/lib/hooks/use-data";

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({ meta: [{ title: "Workers — Script Hub" }] }),
  component: WorkersPage,
});

function WorkersPage() {
  const { data: workers } = useWorkers();
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Workers</h1>
        <p className="text-sm text-muted-foreground">External script runners. Workers pull queued runs from Supabase Realtime — no inbound port required.</p>
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            <tr>{["Name", "Capabilities", "Queue", "Last seen", "Status"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id} className="border-t border-border">
                <td className="px-4 py-2.5">{w.name}</td>
                <td className="px-4 py-2.5 font-mono text-[11px]">
                  {[w.capabilities?.python && "py", w.capabilities?.r && "r", w.capabilities?.bash && "bash"].filter(Boolean).join(" · ")}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px]">{w.queue_depth}</td>
                <td className="px-4 py-2.5 font-mono text-[11px]">{w.last_seen_at ? new Date(w.last_seen_at).toLocaleTimeString() : "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-mono text-[10px] uppercase ${w.status === "online" ? "text-success" : "text-muted-foreground"}`}>● {w.status}</span>
                </td>
              </tr>
            ))}
            {workers.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">No workers connected. Deploy the worker on your VPS — see <code>worker/README.md</code>.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
