import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { getProfileWithCapabilities, type ProfileCapabilities } from "@/lib/profile-utils";

export interface AuthProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileCapabilities, setProfileCapabilities] = useState<ProfileCapabilities>({ hasAvatarUrl: false, hasBio: false });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); setProfileCapabilities({ hasAvatarUrl: false, hasBio: false }); setIsAdmin(false); return; }
    // Ensure a profile row exists (covers users created before the trigger was installed).
    await supabase.from("profiles").upsert({
      id: u.id,
      email: u.email ?? null,
      display_name: (u.user_metadata as any)?.name ?? (u.email ? u.email.split("@")[0] : null),
    }, { onConflict: "id", ignoreDuplicates: true });
    const [{ profile: prof, capabilities }, { data: roles }] = await Promise.all([
      getProfileWithCapabilities(u.id),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
    ]);
    setProfile((prof as AuthProfile) ?? null);
    setProfileCapabilities(capabilities);
    setIsAdmin(!!roles?.some((r: any) => r.role === "admin"));
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // defer to avoid deadlocks
      setTimeout(() => refresh(s?.user ?? null), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      refresh(data.session?.user ?? null).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return {
    session, user, profile, profileCapabilities, isAdmin, loading,
    signIn: async (email: string, password: string, captchaToken?: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } as any });
      if (error) throw error;
    },
    signUp: async (email: string, password: string, displayName: string, captchaToken?: string) => {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          data: { name: displayName },
          captchaToken,
        } as any,
      });
      if (error) throw error;
      return data;
    },
    signOut: async () => { await supabase.auth.signOut(); },
    refreshProfile: () => refresh(user),
  };
}
