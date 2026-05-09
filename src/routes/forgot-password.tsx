import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePublicSettings } from "@/lib/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Captcha } from "@/components/captcha";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Script Hub" }] }),
  ssr: false,
  component: ForgotPage,
});

function ForgotPage() {
  const settings = usePublicSettings();
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: captchaToken ?? undefined,
    } as any);
    setLoading(false);
    if (error) setError(error.message);
    else setInfo("If an account exists for that email, a reset link has been sent.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div>
          <h2 className="font-mono text-2xl tracking-tight">Reset password</h2>
          <p className="mt-1 text-sm text-muted-foreground">We'll email you a link.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <Captcha siteKey={settings?.hcaptcha_site_key} onVerify={setCaptchaToken} />
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        {info && <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{info}</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="text-foreground hover:underline">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
