import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ScriptForm } from "./_authenticated.scripts.$slug.edit";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scripts/new")({
  head: () => ({ meta: [{ title: "New script — Script Hub" }] }),
  component: NewScript,
});

function NewScript() {
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  if (!isAdmin) return <div className="p-10 text-sm text-muted-foreground">Only admins can create scripts.</div>;
  return (
    <ScriptForm
      title="New script"
      onSubmit={async (s) => {
        const { data, error } = await supabase.from("scripts").insert({
          name: s.name ?? "Untitled",
          slug: s.slug ?? "untitled-" + Math.random().toString(36).slice(2, 7),
          description: s.description ?? "",
          language: s.language ?? "python",
          category_id: s.category_id ?? null,
          source: s.source ?? "",
          params_schema: s.params_schema ?? [],
          output_type: s.output_type ?? "text",
          packages: s.packages ?? [],
          tags: s.tags ?? [],
          timeout_s: s.timeout_s ?? 60,
          created_by: user!.id,
        }).select().single();
        if (error) { toast.error(error.message); return; }
        nav({ to: "/scripts/$slug", params: { slug: data.slug } });
      }}
    />
  );
}
