import { useEffect, useState } from "react";
import { db } from "@/lib/mock-db";
import type { AuthUser } from "@/lib/types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => db.auth.current());
  useEffect(() => {
    const off = db.auth.onChange(setUser);
    return () => { off(); };
  }, []);
  return {
    user,
    isAdmin: user?.role === "admin",
    signIn: db.auth.signIn,
    signUp: db.auth.signUp,
    signOut: db.auth.signOut,
  };
}

export function useStoreVersion(key: "scripts" | "runs" | "categories" | "workers") {
  const [, force] = useState(0);
  useEffect(() => {
    // re-render whenever any store change for this key happens
    const id = setInterval(() => force((v) => v + 1), 0);
    clearInterval(id);
    let mounted = true;
    const handler = () => mounted && force((v) => v + 1);
    // Simple subscribe via runs.onAny and a polling fallback
    if (key === "runs") {
      const off = db.runs.onAny(handler);
      return () => { mounted = false; off(); };
    }
    const t = setInterval(handler, 500);
    return () => { mounted = false; clearInterval(t); };
  }, [key]);
}
