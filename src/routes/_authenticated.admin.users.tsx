import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Admin · Users — Isotopiq" }] }),
  component: AdminUsers,
});

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  disabled: boolean;
  created_at: string;
  roles: string[];
}

type RoleRow = {
  user_id: string;
  role: string;
};

type ProfileRow = Omit<UserRow, "roles">;

type UserMetadata = {
  name?: string;
};

function AdminUsers() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,display_name,disabled,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const byUser = new Map<string, string[]>();
    ((roles as RoleRow[] | null) ?? []).forEach((r) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });

    const mapped = ((profs as ProfileRow[] | null) ?? []).map((p) => ({
      ...p,
      roles: byUser.get(p.id) ?? [],
    }));
    const hasCurrentUser = !!user && mapped.some((row) => row.id === user.id);
    const metadata = (user?.user_metadata ?? {}) as UserMetadata;
    const fallbackCurrentUser =
      user && !hasCurrentUser
        ? [
            {
              id: user.id,
              email: user.email ?? null,
              display_name:
                profile?.display_name ??
                metadata.name ??
                (user.email ? user.email.split("@")[0] : null),
              disabled: false,
              created_at: new Date().toISOString(),
              roles: byUser.get(user.id) ?? [],
            },
          ]
        : [];

    setRows([...fallbackCurrentUser, ...mapped]);
    setLoading(false);
  }, [profile?.display_name, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleAdmin = async (u: UserRow) => {
    if (u.roles.includes("admin")) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", u.id)
        .eq("role", "admin");
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: u.id, role: "admin" });
      if (error) return toast.error(error.message);
    }
    toast.success("Roles updated");
    reload();
  };

  const toggleDisabled = async (u: UserRow) => {
    const { error } = await supabase
      .from("profiles")
      .update({ disabled: !u.disabled })
      .eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success(u.disabled ? "User enabled" : "User disabled");
    reload();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="font-mono text-sm">Users ({rows.length})</h3>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          Refresh
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Email</th>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Roles</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-border">
              <td className="px-4 py-2 font-mono text-xs">{u.email ?? "—"}</td>
              <td className="px-4 py-2">{u.display_name ?? "—"}</td>
              <td className="px-4 py-2 font-mono text-xs">{u.roles.join(", ") || "viewer"}</td>
              <td className="px-4 py-2">
                <span className={`text-xs ${u.disabled ? "text-destructive" : "text-success"}`}>
                  {u.disabled ? "disabled" : "active"}
                </span>
              </td>
              <td className="px-4 py-2 text-right space-x-2">
                <Button size="sm" variant="outline" onClick={() => toggleAdmin(u)}>
                  {u.roles.includes("admin") ? "Revoke admin" : "Make admin"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleDisabled(u)}>
                  {u.disabled ? "Enable" : "Disable"}
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No users yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
