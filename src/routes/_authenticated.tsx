import { Outlet, createFileRoute, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => {
    if (!user) nav({ to: "/login" });
  }, [user, nav]);
  if (!user) return null;

  const crumbs = path.split("/").filter(Boolean);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="flex flex-1 items-center gap-2 font-mono text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">~/scripthub</Link>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span>/</span><span className="text-foreground">{c}</span>
                </span>
              ))}
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-mono text-muted-foreground md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              mock data — connect Supabase to persist
            </div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
