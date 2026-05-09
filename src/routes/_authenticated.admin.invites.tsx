import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvites } from "@/lib/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/invites")({
  head: () => ({ meta: [{ title: "Admin · Invites — Isotopiq" }] }),
  component: AdminInvites,
});

function makeCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12)
    .toUpperCase();
}

function AdminInvites() {
  const { user } = useAuth();
  const { data: invites, reload } = useInvites();
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    const code = makeCode();
    const expires_at = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null;
    const { error } = await supabase.from("invite_codes").insert({
      code, max_uses: maxUses, note: note || null, expires_at, created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success(`Invite created: ${code}`);
    setNote("");
    reload();
  };

  const toggleDisabled = async (id: string, disabled: boolean) => {
    const { error } = await supabase.from("invite_codes").update({ disabled: !disabled }).eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("invite_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite deleted");
    reload();
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Copied");
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-3 font-mono text-sm">Create invite</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Max uses</Label>
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expires (days)</Label>
            <Input type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))} placeholder="never" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who is this for?" />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={create} disabled={creating}>{creating ? "Creating..." : "Generate invite code"}</Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-mono text-sm">Invites ({invites.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Code</th>
              <th className="px-4 py-2 text-left">Uses</th>
              <th className="px-4 py-2 text-left">Expires</th>
              <th className="px-4 py-2 text-left">Note</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs flex items-center gap-2">
                  {i.code}
                  <button onClick={() => copy(i.code)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{i.used_count}/{i.max_uses}</td>
                <td className="px-4 py-2 font-mono text-xs">{i.expires_at ? new Date(i.expires_at).toLocaleDateString() : "never"}</td>
                <td className="px-4 py-2 text-xs">{i.note ?? "—"}</td>
                <td className="px-4 py-2 text-xs">{i.disabled ? "disabled" : "active"}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => toggleDisabled(i.id, i.disabled)}>
                    {i.disabled ? "Enable" : "Disable"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(i.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No invites yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
