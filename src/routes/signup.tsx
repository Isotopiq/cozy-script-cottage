import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { db } from "@/lib/mock-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Script Hub" }] }),
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await db.auth.signUp(email, password, name);
      if (db.auth.current()) {
        nav({ to: "/" });
      } else {
        setInfo("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div>
          <h2 className="font-mono text-2xl tracking-tight">Create workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">First user becomes admin.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
        {info && (
          <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{info}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Already have one? <Link to="/login" className="text-foreground hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
