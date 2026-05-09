import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/mock-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Script Hub" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await db.auth.signIn(email, password);
      nav({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-mono text-sm font-semibold">Script Hub</span>
          </div>
          <div>
            <h1 className="font-mono text-4xl leading-tight tracking-tight">
              Run every <span className="text-gradient">Python &amp; R</span> script
              from one place.
            </h1>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              A control plane for one-off scripts. CMS, queued runs, live logs,
              embedded Shiny apps, and an in-browser REPL.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 font-mono text-[11px] text-muted-foreground">
              <div className="rounded border border-border bg-card/60 p-3">
                <div className="text-foreground">$ scripthub run</div>
                <div>weekly-revenue --weeks 12</div>
              </div>
              <div className="rounded border border-border bg-card/60 p-3">
                <div className="text-foreground">$ scripthub repl</div>
                <div>python 3.11 — 4 sessions</div>
              </div>
            </div>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            v0 · phase 1 — mock data
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-mono text-2xl tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your Script Hub workspace.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No account? <Link to="/signup" className="text-foreground hover:underline">Create one</Link>
          </p>
          <p className="text-center text-[11px] text-muted-foreground">
            Connected to your Supabase instance.
          </p>
        </form>
      </div>
    </div>
  );
}
