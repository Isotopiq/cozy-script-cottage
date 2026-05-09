import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LangBadge } from "@/components/status";
import { useCategories, useScripts } from "@/lib/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/scripts/")({
  head: () => ({ meta: [{ title: "Scripts — Script Hub" }] }),
  component: ScriptsList,
});

function ScriptsList() {
  const { isAdmin } = useAuth();
  const { data: scripts, reload } = useScripts();
  const { data: cats } = useCategories();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const filtered = useMemo(() => scripts.filter((s) => {
    if (cat && s.category_id !== cat) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t) || s.tags.some((tg) => tg.toLowerCase().includes(t));
  }), [scripts, q, cat]);

  const toggleFav = async (id: string, current: boolean) => {
    await supabase.from("scripts").update({ favorite: !current }).eq("id", id);
    reload();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-3xl tracking-tight">Scripts</h1>
          <p className="text-sm text-muted-foreground">{scripts.length} scripts in catalog</p>
        </div>
        {isAdmin && (
          <Link to="/scripts/new"><Button><Plus className="mr-1 h-4 w-4" /> New script</Button></Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, tag, description…" className="pl-9" />
        </div>
        <button onClick={() => setCat(null)}
          className={`rounded-full border px-3 py-1 text-xs font-mono ${cat === null ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>all</button>
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={`rounded-full border px-3 py-1 text-xs font-mono ${cat === c.id ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{c.name}</button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => {
          const c = cats.find((c) => c.id === s.category_id);
          return (
            <Card key={s.id} className="group relative flex flex-col gap-3 p-5 transition hover:border-primary/40 hover:shadow-[var(--shadow-glow)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <LangBadge lang={s.language} />
                  {c && <span className="font-mono text-[10px] text-muted-foreground">{c.name}</span>}
                </div>
                {isAdmin && (
                  <button onClick={(e) => { e.preventDefault(); toggleFav(s.id, s.favorite); }}
                    className={`text-muted-foreground hover:text-warning ${s.favorite ? "text-warning" : ""}`}>
                    <Star className="h-4 w-4" fill={s.favorite ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
              <Link to="/scripts/$slug" params={{ slug: s.slug }} className="space-y-1">
                <h3 className="font-mono text-base tracking-tight">{s.name}</h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
              </Link>
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                <div className="flex flex-wrap gap-1">
                  {s.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono">{t}</span>
                  ))}
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{s.run_count} runs</span>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="col-span-full p-10 text-center text-sm text-muted-foreground">
            {scripts.length === 0 ? "No scripts yet. Create your first script." : "No scripts match your filter."}
          </Card>
        )}
      </div>
    </div>
  );
}
