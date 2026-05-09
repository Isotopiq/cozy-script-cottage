import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Script Hub" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
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
            <Row k="Name" v={user?.name ?? "—"} />
            <Row k="Email" v={user?.email ?? "—"} />
            <Row k="Role" v={user?.role ?? "—"} />
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Backend</h3>
          <dl className="space-y-2 text-sm">
            <Row k="Auth" v="Supabase (self-hosted)" />
            <Row k="URL" v="science-script-sanctuary-supabase.cu4huf.easypanel.host" />
            <Row k="Database" v="Supabase Postgres" />
            <Row k="Realtime" v="Supabase channels (when worker writes logs)" />
            <Row k="Scripts / Runs" v="mock — pending external worker" />
          </dl>
          <p className="mt-4 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            Make sure the schema SQL has been applied. Until the worker is built, script execution and run history are still simulated client-side.
          </p>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 font-mono text-sm tracking-tight">Worker callbacks</h3>
          <p className="text-xs text-muted-foreground">
            Workers POST run logs and artifacts back to <code className="rounded bg-secondary px-1 py-0.5 font-mono">/api/public/runs/:id/ingest</code> using an HMAC signature. Configure the shared secret on the worker side from the Workers page.
          </p>
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
