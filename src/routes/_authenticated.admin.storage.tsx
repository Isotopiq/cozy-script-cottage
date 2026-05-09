import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({
      signup_requires_invite: form.signup_requires_invite,
      hcaptcha_site_key: form.hcaptcha_site_key || null,
      s3_endpoint: form.s3_endpoint || null,
      s3_region: form.s3_region || null,
      s3_bucket: form.s3_bucket || null,
      s3_access_key_id: form.s3_access_key_id || null,
      s3_secret_access_key: form.s3_secret_access_key || null,
      s3_force_path_style: !!form.s3_force_path_style,
      s3_public_base_url: form.s3_public_base_url || null,
    }).eq("id", true);
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
          <Field label="Secret access key" k="s3_secret_access_key" form={form} set={set} type="password" />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Force path style</Label>
            <p className="text-xs text-muted-foreground">Required for MinIO and most non-AWS providers.</p>
          </div>
          <Switch checked={!!form.s3_force_path_style} onCheckedChange={(v) => set("s3_force_path_style", v)} />
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
