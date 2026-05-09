import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Script Hub" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: displayName, bio, avatar_url: avatarUrl })
      .eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    refreshProfile();
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { setUploading(false); toast.error(error.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  };

  const updatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const currentPw = String(fd.get("currentpw") ?? "");
    const newPw = String(fd.get("newpw") ?? "");
    const confirmPw = String(fd.get("confirmpw") ?? "");
    if (!currentPw) { toast.error("Enter your current password"); return; }
    if (newPw.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPw !== confirmPw) { toast.error("New passwords do not match"); return; }
    if (newPw === currentPw) { toast.error("New password must be different from current"); return; }
    if (!user?.email) { toast.error("No email on account"); return; }
    // Verify current password by re-authenticating
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
    if (signInErr) { toast.error("Current password is incorrect"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) toast.error(error.message); else toast.success("Password updated");
    form.reset();
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="font-mono text-3xl tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage how you appear to others.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} className="h-16 w-16 rounded-full object-cover" alt="" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary font-mono">
                {(displayName || user?.email || "U").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <input id="avatar" type="file" accept="image/*" hidden
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              <label htmlFor="avatar">
                <Button asChild variant="outline" size="sm" disabled={uploading}>
                  <span>{uploading ? "Uploading…" : "Upload avatar"}</span>
                </Button>
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="font-mono text-sm tracking-tight">Change password</h3>
          <form onSubmit={updatePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newpw">New password</Label>
              <Input id="newpw" name="newpw" type="password" required minLength={6} />
            </div>
            <Button type="submit">Update password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
