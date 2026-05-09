import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logoUrl from "@/assets/isotopiq-logo.png";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { usePublicSettings } from "@/lib/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Captcha } from "@/components/captcha";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Script Hub" }] }),
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { signIn } = useAuth();
  const settings = usePublicSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await signIn(email, password, captchaToken ?? undefined);
      nav({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
    <div className="grid flex-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <img src={logoUrl} alt="Isotopiq" className="h-9 w-auto" />
          <div>
            <h1 className="font-mono text-4xl leading-tight tracking-tight">
              Run every <span className="text-gradient">Python &amp; R</span> script from one place.
            </h1>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              A control plane for one-off scripts. CMS, queued runs, live logs, embedded Shiny apps, and an in-browser REPL.
            </p>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">Isotopiq · Script Hub</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-mono text-2xl tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your Script Hub workspace.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-[11px] text-muted-foreground hover:text-foreground">Forgot?</Link>
            </div>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Captcha siteKey={settings?.hcaptcha_site_key} onVerify={setCaptchaToken} />
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No account? <Link to="/signup" className="text-foreground hover:underline">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
