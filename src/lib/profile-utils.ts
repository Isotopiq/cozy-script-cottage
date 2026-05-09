import { supabase } from "@/lib/supabase";

export interface ProfileCapabilities {
  hasAvatarUrl: boolean;
  hasBio: boolean;
}

export interface ProfileRecord {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

const PROFILE_SELECT_CANDIDATES: Array<{
  select: string;
  capabilities: ProfileCapabilities;
}> = [
  {
    select: "id,email,display_name,avatar_url,bio",
    capabilities: { hasAvatarUrl: true, hasBio: true },
  },
  {
    select: "id,email,display_name,avatar_url",
    capabilities: { hasAvatarUrl: true, hasBio: false },
  },
  {
    select: "id,email,display_name,bio",
    capabilities: { hasAvatarUrl: false, hasBio: true },
  },
  {
    select: "id,email,display_name",
    capabilities: { hasAvatarUrl: false, hasBio: false },
  },
];

function normalizeProfile(data: Record<string, unknown> | null, capabilities: ProfileCapabilities): ProfileRecord | null {
  if (!data) return null;

  return {
    id: String(data.id ?? ""),
    email: data.email ? String(data.email) : null,
    display_name: data.display_name ? String(data.display_name) : null,
    avatar_url: capabilities.hasAvatarUrl && data.avatar_url ? String(data.avatar_url) : null,
    bio: capabilities.hasBio && data.bio ? String(data.bio) : null,
  };
}

export async function getProfileWithCapabilities(userId: string): Promise<{
  profile: ProfileRecord | null;
  capabilities: ProfileCapabilities;
}> {
  for (const candidate of PROFILE_SELECT_CANDIDATES) {
    const { data, error } = await supabase
      .from("profiles")
      .select(candidate.select)
      .eq("id", userId)
      .maybeSingle();

    if (!error) {
      return {
        profile: normalizeProfile(data as Record<string, unknown> | null, candidate.capabilities),
        capabilities: candidate.capabilities,
      };
    }
  }

  return {
    profile: null,
    capabilities: { hasAvatarUrl: false, hasBio: false },
  };
}

export async function updateProfileWithCapabilities(
  userId: string,
  values: { display_name: string; avatar_url: string | null; bio: string },
  capabilities: ProfileCapabilities,
) {
  const payload: Record<string, unknown> = {
    display_name: values.display_name,
  };

  if (capabilities.hasAvatarUrl) {
    payload.avatar_url = values.avatar_url;
  }

  if (capabilities.hasBio) {
    payload.bio = values.bio;
  }

  return supabase.from("profiles").update(payload).eq("id", userId);
}