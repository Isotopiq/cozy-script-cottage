import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db } from "@/lib/mock-db";
import { Card } from "@/components/ui/card";
import { LangBadge, StatusPill } from "@/components/status";

export const Route = createFileRoute("/_authenticated/runs/")({
  head: () => ({ meta: [{ title: "Runs — Script Hub" }] }),
  component: RunsList,
});

function RunsList() {
  const [, force] = useState(0);
  useEffect(() => {
    const off = db.runs.onAny(() => force((x) => x + 1));
    return () => { off(); };
  }, []);
  const runs = db.runs.list();
  const scripts = db.scripts.list();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Runs</h1>
        <p className="text-sm text-muted-foreground">{runs.length} runs across all scripts</p>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            <tr>
              {["Script", "Triggered by", "Started", "Duration", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const s = scripts.find((x) => x.id === r.scriptId);
              return (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/20">
                  <td className="px-4 py-2.5">
                    <Link to="/runs/$id" params={{ id: r.id }} className="flex items-center gap-2 hover:text-primary">
                      {s && <LangBadge lang={s.language} />}
                      <span>{s?.name ?? r.scriptId}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.triggeredBy}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
