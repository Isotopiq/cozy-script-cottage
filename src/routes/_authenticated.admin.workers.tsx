import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkers } from "@/lib/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/workers")({
  head: () => ({ meta: [{ title: "Admin · Workers — Isotopiq" }] }),
  component: AdminWorkers,
});

function AdminWorkers() {
  const { data: workers, reload } = useWorkers();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const create = async () => {
    if (!name) return;
    setCreating(true);
    // Generate worker token client-side; worker uses it to claim runs.
    const tok = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data, error } = await supabase.from("workers").insert({
      name,
      status: "offline",
      capabilities: { python: true, r: true, bash: true },
      token: tok,
    }).select().single();
    setCreating(false);
    if (error) return toast.error(error.message);
    setToken(`${data.id}:${tok}`);
    setName("");
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this worker?")) return;
    const { error } = await supabase.from("workers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Worker removed");
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-3 font-mono text-sm">Register worker</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Worker name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vps-worker-1" />
          </div>
          <Button onClick={create} disabled={creating || !name}>{creating ? "Creating..." : "Register"}</Button>
        </div>
        {token && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <p className="font-mono mb-2 text-warning-foreground font-semibold">Save this token now — it won't be shown again:</p>
            <code className="block break-all rounded bg-background p-2 font-mono text-foreground">{token}</code>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-mono text-sm">Workers ({workers.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Capabilities</th>
              <th className="px-4 py-2 text-left">Queue</th>
              <th className="px-4 py-2 text-left">Last seen</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{w.name}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs ${w.status === "online" ? "text-success" : w.status === "degraded" ? "text-warning" : "text-muted-foreground"}`}>
                    {w.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs font-mono">
                  {Object.entries(w.capabilities ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ")}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{w.queue_depth}</td>
                <td className="px-4 py-2 font-mono text-xs">{w.last_seen_at ? new Date(w.last_seen_at).toLocaleString() : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => remove(w.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No workers registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
