import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AwsClient } from "aws4fetch";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/lib/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/storage")({
  head: () => ({ meta: [{ title: "Admin · Storage — Isotopiq" }] }),
  component: AdminStorage,
});

function AdminStorage() {
  const { data, reload } = useAppSettings();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const testS3 = async () => {
    if (!form.s3_endpoint || !form.s3_bucket || !form.s3_access_key_id || !form.s3_secret_access_key) {
      toast.error("Enter endpoint, bucket, access key, and secret to test. The secret is never stored in the browser and must be re-entered each session.");
      return;
    }
    setTesting(true);
    try {
      const client = new AwsClient({
        accessKeyId: form.s3_access_key_id,
        secretAccessKey: form.s3_secret_access_key,
        region: form.s3_region || "us-east-1",
        service: "s3",
      });
      const endpoint = String(form.s3_endpoint).replace(/\/+$/, "");
      const url = form.s3_force_path_style
        ? `${endpoint}/${form.s3_bucket}/?list-type=2&max-keys=1`
        : endpoint.replace(/^(https?:\/\/)/, `$1${form.s3_bucket}.`) + `/?list-type=2&max-keys=1`;
      const res = await client.fetch(url, { method: "GET" });
      if (!res.ok) {
        const body = await res.text();
        toast.error(`S3 test failed (${res.status}): ${body.slice(0, 200)}`);
      } else {
        toast.success("S3 connection OK");
      }
    } catch (e: any) {
      toast.error(`S3 test failed: ${e.message ?? e}. If the browser blocked it via CORS, configure the bucket to allow this origin.`);
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => { if (data) setForm({ ...data, s3_secret_access_key: "" }); }, [data]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    // SECURITY: route writes through a SECURITY DEFINER RPC. The S3 secret is
    // only sent when the admin has typed a new value; otherwise the stored
    // secret is preserved server-side and never round-trips through the browser.
    const { error } = await supabase.rpc("update_app_settings", {
      _signup_requires_invite: !!form.signup_requires_invite,
      _hcaptcha_site_key: form.hcaptcha_site_key || null,
      _s3_endpoint: form.s3_endpoint || null,
      _s3_region: form.s3_region || null,
      _s3_bucket: form.s3_bucket || null,
      _s3_access_key_id: form.s3_access_key_id || null,
      _s3_secret_access_key: form.s3_secret_access_key || null,
      _s3_force_path_style: !!form.s3_force_path_style,
      _s3_public_base_url: form.s3_public_base_url || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    reload();
  };

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <h3 className="font-mono text-sm">Authentication</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Require invite for signup</Label>
            <p className="text-xs text-muted-foreground">New users must provide an invite code.</p>
          </div>
          <Switch checked={!!form.signup_requires_invite} onCheckedChange={(v) => set("signup_requires_invite", v)} />
        </div>
        <Field label="hCaptcha site key" k="hcaptcha_site_key" form={form} set={set} placeholder="(optional)" />
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-mono text-sm">S3 / Object storage</h3>
        <p className="text-xs text-muted-foreground">For uploaded script source files and run artifacts.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Endpoint" k="s3_endpoint" form={form} set={set} placeholder="https://s3.example.com" />
          <Field label="Region" k="s3_region" form={form} set={set} placeholder="us-east-1" />
          <Field label="Bucket" k="s3_bucket" form={form} set={set} />
          <Field label="Public base URL" k="s3_public_base_url" form={form} set={set} placeholder="https://cdn.example.com" />
          <Field label="Access key ID" k="s3_access_key_id" form={form} set={set} />
          <Field
            label="Secret access key"
            k="s3_secret_access_key"
            form={form}
            set={set}
            type="password"
            placeholder={form.s3_secret_configured ? "•••••••• (stored — leave blank to keep)" : "Enter secret"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The S3 secret is stored only on the server. It is never returned to the browser, so it must be re-entered to change it or run a connection test.
        </p>
        <div className="flex items-center justify-between">
          <div>
            <Label>Force path style</Label>
            <p className="text-xs text-muted-foreground">Required for MinIO and most non-AWS providers.</p>
          </div>
          <Switch checked={!!form.s3_force_path_style} onCheckedChange={(v) => set("s3_force_path_style", v)} />
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={testS3} disabled={testing}>
            {testing ? "Testing..." : "Test S3 connection"}
          </Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</Button>
      </div>
    </div>
  );
}

function Field({ label, k, form, set, type = "text", placeholder }: any) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
    </div>
  );
}
