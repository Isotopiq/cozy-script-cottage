import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCategories, useScripts } from "@/lib/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({ meta: [{ title: "Categories — Script Hub" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { isAdmin } = useAuth();
  const { data: cats, reload } = useCategories();
  const { data: scripts } = useScripts();
  const [name, setName] = useState("");

  const create = async () => {
    if (!name) return;
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const { error } = await supabase.from("categories").insert({ name, slug });
    if (error) { toast.error(error.message); return; }
    setName(""); reload();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message); else reload();
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">Group scripts for easier discovery.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {cats.map((c) => {
              const count = scripts.filter((s) => s.category_id === c.id).length;
              return (
                <li key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color ?? "var(--chart-1)" }} />
                    <span className="font-mono text-sm">{c.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{count} scripts</span>
                  </div>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </li>
              );
            })}
            {cats.length === 0 && <li className="px-4 py-10 text-center text-xs text-muted-foreground">No categories yet.</li>}
          </ul>
        </Card>
        {isAdmin && (
          <Card className="space-y-3 p-5">
            <h3 className="font-mono text-sm tracking-tight">New category</h3>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Ops" />
            <Button className="w-full" onClick={create}><Plus className="mr-1 h-4 w-4" /> Create</Button>
          </Card>
        )}
      </div>
    </div>
  );
}
