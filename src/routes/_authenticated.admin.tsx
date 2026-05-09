import { Outlet, createFileRoute, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => {
    if (!loading && !isAdmin) nav({ to: "/" });
  }, [isAdmin, loading, nav]);

  const tabs = [
    { to: "/admin", label: "Overview", exact: true },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/invites", label: "Invites" },
    { to: "/admin/storage", label: "Storage" },
    { to: "/admin/workers", label: "Workers" },
  ];
  const isActive = (to: string, exact?: boolean) => exact ? path === to : path.startsWith(to);

  if (!isAdmin) return null;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Workspace administration.</p>
      </div>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`px-3 py-2 text-sm font-mono border-b-2 -mb-px transition-colors ${
              isActive(t.to, t.exact) ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
