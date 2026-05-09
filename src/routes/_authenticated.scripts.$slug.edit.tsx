import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Save } from "lucide-react";
import { useCategories, useScript, type DBScript } from "@/lib/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CodeEditor } from "@/components/code-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scripts/$slug/edit")({
  head: () => ({ meta: [{ title: "Edit script — Script Hub" }] }),
  component: EditScript,
});

function EditScript() {
  const { slug } = useParams({ from: "/_authenticated/scripts/$slug/edit" });
  const { data: existing, loading } = useScript(slug);
  const nav = useNavigate();
  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!existing) return <div className="p-10 text-sm text-muted-foreground">Script not found.</div>;
  return (
    <ScriptForm
      initial={existing}
      title="Edit script"
      onSubmit={async (patch) => {
        const { error } = await supabase.from("scripts").update(patch).eq("id", existing.id);
        if (error) { toast.error(error.message); return; }
        nav({ to: "/scripts/$slug", params: { slug: patch.slug ?? existing.slug } });
      }}
    />
  );
}

export function ScriptForm({ initial, title, onSubmit }: { initial?: Partial<DBScript>; title: string; onSubmit: (s: Partial<DBScript>) => Promise<void> | void }) {
  const { data: cats } = useCategories();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [language, setLanguage] = useState<DBScript["language"]>(initial?.language ?? "python");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [outputType, setOutputType] = useState<DBScript["output_type"]>(initial?.output_type ?? "text");
  const [packages, setPackages] = useState((initial?.packages ?? []).join(", "));
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [timeoutS, setTimeoutS] = useState(initial?.timeout_s ?? 60);
  const [source, setSource] = useState(initial?.source ?? "");
  const [paramsJson, setParamsJson] = useState(JSON.stringify(initial?.params_schema ?? [], null, 2));
  const [paramsErr, setParamsErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: any[] = [];
    try { parsed = JSON.parse(paramsJson); setParamsErr(null); }
    catch (err) { setParamsErr((err as Error).message); return; }
    onSubmit({
      name, slug: slug || name.toLowerCase().replace(/\s+/g, "-"), description,
      language, category_id: categoryId || null, output_type: outputType,
      packages: packages.split(",").map((p) => p.trim()).filter(Boolean),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      timeout_s: timeoutS, source, params_schema: parsed,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-3xl tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Define metadata, parameters and source code.</p>
        </div>
        <Button type="submit"><Save className="mr-1 h-4 w-4" /> Save</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Slug"><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-from-name" /></Field>
          </div>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="r">R</SelectItem>
                  <SelectItem value="bash">Bash</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Output type">
              <Select value={outputType} onValueChange={(v) => setOutputType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="chart">Chart</SelectItem>
                  <SelectItem value="shiny">Shiny / GUI</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Timeout (s)"><Input type="number" value={timeoutS} onChange={(e) => setTimeoutS(Number(e.target.value))} /></Field>
          </div>
          <Field label="Packages (comma separated)"><Input value={packages} onChange={(e) => setPackages(e.target.value)} placeholder="pandas, numpy" /></Field>
          <Field label="Tags (comma separated)"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="finance, etl" /></Field>
        </Card>
        <Card className="space-y-3 p-5">
          <Field label="Source code">
            <CodeEditor value={source} onChange={setSource} language={language} minHeight="360px" />
          </Field>
          <Field label="Params schema (JSON)">
            <CodeEditor value={paramsJson} onChange={setParamsJson} language="json" minHeight="260px" />
            {paramsErr && <p className="mt-1 text-xs text-destructive">{paramsErr}</p>}
          </Field>
        </Card>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
