import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { SUPABASE_URL } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Script Hub" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, isAdmin } = useAuth();
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace and integration configuration.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Account</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Display name" v={profile?.display_name ?? "—"} />
            <Row k="Email" v={user?.email ?? "—"} />
            <Row k="Role" v={isAdmin ? "admin" : "viewer"} />
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Backend</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Auth" v="Supabase (self-hosted)" />
            <Row k="URL" v={SUPABASE_URL.replace(/^https?:\/\//, "")} />
            <Row k="Realtime" v="enabled (runs + run_logs)" />
          </dl>
          {isAdmin && (
            <p className="mt-4 rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Admin features (users, invites, S3, workers) are in the <strong>Admin</strong> sidebar group.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/60 py-1.5">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="font-mono text-xs">{v}</dd>
    </div>
  );
}
