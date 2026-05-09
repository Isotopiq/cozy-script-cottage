import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/mock-db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({ meta: [{ title: "Workers — Script Hub" }] }),
  component: WorkersPage,
});

function WorkersPage() {
  const [, force] = useState(0);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    if (!name || !url) return;
    db.workers.create(name, url);
    setName(""); setUrl("");
    force((x) => x + 1);
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Workers</h1>
        <p className="text-sm text-muted-foreground">Register external script runners. Workers receive jobs over signed HTTP and stream logs back via WebSocket.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr>{["Name", "Base URL", "Capabilities", "Queue", "Last seen", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {db.workers.list().map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="px-4 py-2.5">{w.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{w.baseUrl}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">
                    {[w.capabilities.python && "py", w.capabilities.r && "r", w.capabilities.docker && "docker"].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{w.queueDepth}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{new Date(w.lastSeenAt).toLocaleTimeString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono text-[10px] uppercase ${w.status === "online" ? "text-success" : "text-muted-foreground"}`}>● {w.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { db.workers.remove(w.id); force((x) => x + 1); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="font-mono text-sm tracking-tight">Register worker</h3>
          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="primary-worker" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase">Base URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://worker.example.com" />
          </div>
          <Button onClick={add} className="w-full"><Plus className="mr-1 h-4 w-4" /> Add worker</Button>
          <p className="text-[11px] text-muted-foreground">A shared HMAC secret is generated server-side; rotate it any time from this page.</p>
        </Card>
      </div>
    </div>
  );
}
