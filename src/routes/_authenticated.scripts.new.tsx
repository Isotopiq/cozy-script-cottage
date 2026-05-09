import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { db } from "@/lib/mock-db";
import { ScriptForm } from "./_authenticated.scripts.$slug.edit";

export const Route = createFileRoute("/_authenticated/scripts/new")({
  head: () => ({ meta: [{ title: "New script — Script Hub" }] }),
  component: NewScript,
});

function NewScript() {
  const nav = useNavigate();
  return (
    <ScriptForm
      title="New script"
      onSubmit={(s) => {
        const created = db.scripts.create({
          name: s.name ?? "Untitled",
          slug: s.slug ?? "untitled",
          description: s.description ?? "",
          language: s.language ?? "python",
          categoryId: s.categoryId ?? db.categories.list()[0]?.id ?? "",
          source: s.source ?? "",
          paramsSchema: s.paramsSchema ?? [],
          outputType: s.outputType ?? "text",
          packages: s.packages ?? [],
          tags: s.tags ?? [],
          timeoutS: s.timeoutS ?? 60,
        });
        nav({ to: "/scripts/$slug", params: { slug: created.slug } });
      }}
    />
  );
}
