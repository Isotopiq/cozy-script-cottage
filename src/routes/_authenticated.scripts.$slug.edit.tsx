import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Save } from "lucide-react";
import { db } from "@/lib/mock-db";
import type { Language, OutputType, ParamField, Script } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/scripts/$slug/edit")({
  head: () => ({ meta: [{ title: "Edit script — Script Hub" }] }),
  component: EditScript,
});

function EditScript() {
  const { slug } = useParams({ from: "/_authenticated/scripts/$slug/edit" });
  const existing = db.scripts.get(slug);
  const nav = useNavigate();
  if (!existing) return <div className="p-10 text-sm text-muted-foreground">Script not found.</div>;
  return <ScriptForm initial={existing} onSubmit={(patch) => { db.scripts.update(existing.id, patch); nav({ to: "/scripts/$slug", params: { slug: patch.slug ?? existing.slug } }); }} title="Edit script" />;
}

export function ScriptForm({ initial, title, onSubmit }: { initial?: Partial<Script>; title: string; onSubmit: (s: Partial<Script>) => void }) {
  const cats = db.categories.list();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [language, setLanguage] = useState<Language>(initial?.language ?? "python");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? cats[0]?.id ?? "");
  const [outputType, setOutputType] = useState<OutputType>(initial?.outputType ?? "text");
  const [packages, setPackages] = useState((initial?.packages ?? []).join(", "));
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [timeoutS, setTimeoutS] = useState(initial?.timeoutS ?? 60);
  const [source, setSource] = useState(initial?.source ?? "");
  const [paramsJson, setParamsJson] = useState(JSON.stringify(initial?.paramsSchema ?? [], null, 2));
  const [paramsErr, setParamsErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: ParamField[] = [];
    try { parsed = JSON.parse(paramsJson); setParamsErr(null); }
    catch (err) { setParamsErr((err as Error).message); return; }
    onSubmit({
      name, slug: slug || name.toLowerCase().replace(/\s+/g, "-"), description,
      language, categoryId, outputType,
      packages: packages.split(",").map((p) => p.trim()).filter(Boolean),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      timeoutS, source, paramsSchema: parsed,
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
              <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Output type">
              <Select value={outputType} onValueChange={(v) => setOutputType(v as OutputType)}>
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
            <Textarea value={source} onChange={(e) => setSource(e.target.value)} rows={14} className="font-mono text-xs" />
          </Field>
          <Field label="Params schema (JSON)">
            <Textarea value={paramsJson} onChange={(e) => setParamsJson(e.target.value)} rows={10} className="font-mono text-xs" />
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
