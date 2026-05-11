import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { getProfileWithCapabilities, type ProfileCapabilities } from "@/lib/profile-utils";

type UserMetadata = {
  name?: string;
};

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
  const [profileCapabilities, setProfileCapabilities] = useState<ProfileCapabilities>({
    hasAvatarUrl: false,
    hasBio: false,
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setProfileCapabilities({ hasAvatarUrl: false, hasBio: false });
      setIsAdmin(false);
      return;
    }

    const metadata = (u.user_metadata ?? {}) as UserMetadata;
    const fallbackDisplayName = metadata.name ?? (u.email ? u.email.split("@")[0] : null);

    // Ensure a profile row exists (covers users created before the trigger was installed).
    await supabase.from("profiles").upsert(
      {
        id: u.id,
        email: u.email ?? null,
        display_name: fallbackDisplayName,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

    const [{ profile: prof, capabilities }, { data: roles }, { data: disabledRow }] = await Promise.all([
      getProfileWithCapabilities(u.id),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
      supabase.from("profiles").select("disabled").eq("id", u.id).maybeSingle(),
    ]);

    // SECURITY: Enforce admin "disabled" flag — sign out immediately if set.
    if (disabledRow?.disabled) {
      await supabase.auth.signOut();
      setProfile(null);
      setProfileCapabilities({ hasAvatarUrl: false, hasBio: false });
      setIsAdmin(false);
      if (typeof window !== "undefined") {
        window.location.href = "/login?disabled=1";
      }
      return;
    }

    setProfile(
      (prof as AuthProfile) ?? {
        id: u.id,
        email: u.email ?? "",
        display_name: fallbackDisplayName,
        avatar_url: null,
        bio: null,
      },
    );
    setProfileCapabilities(capabilities);
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
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
    session,
    user,
    profile,
    profileCapabilities,
    isAdmin,
    loading,
    signIn: async (email: string, password: string, captchaToken?: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
      if (error) throw error;
    },
    signUp: async (
      email: string,
      password: string,
      displayName: string,
      captchaToken?: string,
      inviteCode?: string,
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          // invite_code is consumed atomically server-side by the
          // handle_new_user trigger — works even when email confirmation
          // is required and no client session is established.
          data: { name: displayName, invite_code: inviteCode ?? null },
          captchaToken,
        },
      });
      if (error) throw error;
      return data;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshProfile: () => refresh(user),
  };
}
