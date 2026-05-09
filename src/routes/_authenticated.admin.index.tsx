import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Isotopiq" }] }),
  component: AdminOverview,
});

function AdminOverview() {
  const [stats, setStats] = useState<{ users: number; scripts: number; runs: number; workers: number } | null>(null);

  useEffect(() => {
    (async () => {
      const [u, s, r, w] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("scripts").select("id", { count: "exact", head: true }),
        supabase.from("runs").select("id", { count: "exact", head: true }),
        supabase.from("workers").select("id", { count: "exact", head: true }),
      ]);
      setStats({ users: u.count ?? 0, scripts: s.count ?? 0, runs: r.count ?? 0, workers: w.count ?? 0 });
    })();
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Stat label="Users" value={stats?.users} />
      <Stat label="Scripts" value={stats?.scripts} />
      <Stat label="Runs" value={stats?.runs} />
      <Stat label="Workers" value={stats?.workers} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="p-5">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-3xl">{value ?? "—"}</div>
    </Card>
  );
}
