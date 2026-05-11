import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkers } from "@/lib/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Trash2, Copy, Check, Activity } from "lucide-react";
import { SUPABASE_URL } from "@/lib/supabase";

type WorkerInsertResult = {
  id: string;
};

function generateWorkerSecret(length = 40) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export const Route = createFileRoute("/_authenticated/admin/workers")({
  head: () => ({ meta: [{ title: "Admin · Workers — Isotopiq" }] }),
  component: AdminWorkers,
});

function AdminWorkers() {
  const { data: workers, reload } = useWorkers();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);

  const create = async () => {
    if (!name || !baseUrl) return;
    setCreating(true);
    const workerSecret = generateWorkerSecret();
    let { data, error } = await supabase
      .from("workers")
      .insert({
        name,
        base_url: baseUrl,
        status: "offline",
        capabilities: { python: true, r: true, bash: true },
        secret_hash: workerSecret,
      } as never)
      .select()
      .single<WorkerInsertResult>();

    if (error && /column\s+"secret_hash"/i.test(error.message)) {
      ({ data, error } = await supabase
        .from("workers")
        .insert({
          name,
          base_url: baseUrl,
          status: "offline",
          capabilities: { python: true, r: true, bash: true },
        } as never)
        .select()
        .single<WorkerInsertResult>());
    }

    setCreating(false);
    if (error) return toast.error(error.message);
    if (!data) return toast.error("Worker registration returned no data");
    setWorkerId(data.id);
    setName("");
    setBaseUrl("");
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
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] items-end">
          <div className="space-y-1">
            <Label className="text-xs">Worker name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vps-worker-1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://worker.example.com"
            />
          </div>
          <Button onClick={create} disabled={creating || !name || !baseUrl}>
            {creating ? "Creating..." : "Register"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Base URL is the public address of the VPS running the worker. It can be a placeholder
          (e.g. <code className="font-mono">https://pending</code>) if the worker only polls — it
          just must not be empty.
        </p>
        {workerId && <DeploySnippet workerId={workerId} />}
      </Card>

      <DeployGuide />

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
                  <span
                    className={`text-xs ${w.status === "online" ? "text-success" : w.status === "degraded" ? "text-warning" : "text-muted-foreground"}`}
                  >
                    {w.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs font-mono">
                  {Object.entries(w.capabilities ?? {})
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(", ")}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{w.queue_depth}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {w.last_seen_at ? new Date(w.last_seen_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button asChild size="sm" variant="outline" title="Resource monitor">
                    <Link to="/admin/workers/$id" params={{ id: w.id }}><Activity className="h-3 w-3" /></Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(w.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No workers registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function CopyBlock({ label, value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      {label && <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>}
      <div className="relative group">
        <pre className="overflow-x-auto rounded bg-background border border-border p-3 pr-10 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
{value}
        </pre>
        <Button
          size="sm"
          variant="outline"
          className="absolute right-1.5 top-1.5 h-7 w-7 p-0"
          onClick={copy}
          aria-label="Copy"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

function DeploySnippet({ workerId }: { workerId: string }) {
  const envBlock = `SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key>
WORKER_ID=${workerId}`;
  return (
    <div className="mt-4 space-y-3 rounded-md border border-success/40 bg-success/10 p-3 text-xs">
      <p className="font-mono font-semibold">Worker registered. Run this on the VPS:</p>
      <CopyBlock label=".env" value={envBlock} />
      <CopyBlock
        label="Deploy"
        value={`git clone <your-repo-url> isotopiq && cd isotopiq/worker
cp .env.example .env
# paste the values above into .env, then:
docker compose up -d --build
docker compose logs -f worker`}
      />
      <p className="text-muted-foreground">
        Service role key is in your Supabase dashboard → Project Settings → API. Keep it on the VPS only.
      </p>
    </div>
  );
}

function DeployGuide() {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-mono text-sm">VPS deployment — full guide</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Run these commands on any Debian/Ubuntu VPS with outbound HTTPS to this Supabase instance.
          The worker only polls — no inbound port required.
        </p>
      </div>

      <CopyBlock
        label="1. Install Docker (one-time)"
        value={`curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out + back in`}
      />

      <CopyBlock
        label="2. Get the worker source"
        value={`git clone <your-repo-url> isotopiq
cd isotopiq/worker`}
      />

      <CopyBlock
        label="3. Configure (register a worker above to fill in WORKER_ID)"
        value={`cp .env.example .env
nano .env
# SUPABASE_URL=${SUPABASE_URL}
# SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
# WORKER_ID=<uuid-from-register-above>`}
      />

      <CopyBlock
        label="4. Build & start"
        value={`docker compose up -d --build
docker compose logs -f worker`}
      />

      <CopyBlock
        label="Update later"
        value={`git pull
docker compose up -d --build`}
      />

      <CopyBlock
        label="Stop"
        value={`docker compose down`}
      />

      <p className="text-[11px] text-muted-foreground">
        After startup, the worker appears as <span className="text-success">online</span> in the table below and refreshes <code className="font-mono">last_seen_at</code> every 15s.
      </p>
    </Card>
  );
}
