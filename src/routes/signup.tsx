import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePublicSettings } from "@/lib/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Captcha } from "@/components/captcha";
import logoUrl from "@/assets/isotopiq-logo.png";
import { Footer } from "@/components/footer";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Script Hub" }] }),
  ssr: false,
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const { signUp } = useAuth();
  const settings = usePublicSettings();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      // Invite code is validated and consumed atomically server-side by the
      // handle_new_user trigger via raw_user_meta_data. This works even when
      // email confirmation is enabled (no client session post-signUp).
      await signUp(
        email,
        password,
        name,
        captchaToken ?? undefined,
        settings?.signup_requires_invite ? invite : undefined,
      );
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) nav({ to: "/" });
      else setInfo("Check your inbox to confirm your email, then sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
    <div className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-3">
          <img src={logoUrl} alt="Isotopiq" className="h-9 w-auto" />
          <div className="text-center">
            <h2 className="font-mono text-2xl tracking-tight">Create account</h2>
            <p className="mt-1 text-sm text-muted-foreground">First user becomes admin automatically.</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
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
        {settings?.signup_requires_invite && (
          <div className="space-y-2">
            <Label htmlFor="invite">Invite code</Label>
            <Input id="invite" value={invite} onChange={(e) => setInvite(e.target.value)} required placeholder="From an admin" />
          </div>
        )}
        <Captcha siteKey={settings?.hcaptcha_site_key} onVerify={setCaptchaToken} />
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        {info && <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{info}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Already have one? <Link to="/login" className="text-foreground hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
    <Footer />
    </div>
  );
}
