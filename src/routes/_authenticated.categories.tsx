import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/mock-db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({ meta: [{ title: "Categories — Script Hub" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const [, force] = useState(0);
  const [name, setName] = useState("");
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">Group scripts for easier discovery.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {db.categories.list().map((c) => {
              const count = db.scripts.list().filter((s) => s.categoryId === c.id).length;
              return (
                <li key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="font-mono text-sm">{c.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{count} scripts</span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { db.categories.remove(c.id); force((x) => x + 1); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="font-mono text-sm tracking-tight">New category</h3>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data Ops" />
          <Button className="w-full" onClick={() => { if (name) { db.categories.create(name); setName(""); force((x) => x + 1); } }}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </Card>
      </div>
    </div>
  );
}
