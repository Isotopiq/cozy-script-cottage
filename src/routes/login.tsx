import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePublicSettings } from "@/lib/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Captcha } from "@/components/captcha";
import logoUrl from "@/assets/isotopiq-logo.png";
import { Footer } from "@/components/footer";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Isotopiq" }] }),
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
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] translate-x-1/3 translate-y-1/3 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute inset-0 bg-grid opacity-[0.04]" />
      </div>

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src={logoUrl} alt="Isotopiq" className="h-10 w-auto object-contain" />
            <p className="mt-4 text-sm text-muted-foreground">
              Sign in to your Script Hub workspace
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-7 shadow-xl shadow-black/5 backdrop-blur-sm">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                    Forgot?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-10"
                />
              </div>

              {settings?.hcaptcha_site_key && (
                <Captcha siteKey={settings.hcaptcha_site_key} onVerify={setCaptchaToken} />
              )}

              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link to="/signup" className="font-medium text-foreground transition-colors hover:text-primary">
              Create one
            </Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
