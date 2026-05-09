import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// =============== Generic helpers ===============
export type Json = any;

// =============== Types (DB row shapes) ===============
export interface DBCategory { id: string; name: string; slug: string; color: string | null; }

export interface DBScript {
  id: string; slug: string; name: string; description: string;
  language: "python" | "r" | "bash";
  category_id: string | null;
  source: string;
  source_file_url: string | null;
  params_schema: Array<{ key: string; label: string; type: "string"|"number"|"boolean"|"select"; default?: any; options?: string[]; required?: boolean }>;
  output_type: "text" | "table" | "chart" | "shiny";
  packages: string[];
  tags: string[];
  timeout_s: number;
  favorite: boolean;
  run_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBRun {
  id: string;
  script_id: string;
  triggered_by: string | null;
  worker_id: string | null;
  status: "queued"|"running"|"succeeded"|"failed"|"canceled";
  params: Record<string, unknown>;
  exit_code: number | null;
  duration_ms: number | null;
  output: any;
  error_message: string | null;
  artifact_keys: string[] | null;
  started_at: string;
  finished_at: string | null;
  claimed_at: string | null;
}

export interface DBRunLog { id: number; run_id: string; ts: string; stream: "stdout"|"stderr"|"system"; line: string; }

export interface DBWorker {
  id: string; name: string;
  status: "online"|"offline"|"degraded";
  last_seen_at: string | null;
  capabilities: { python: boolean; r: boolean; bash: boolean };
  queue_depth: number;
  created_at: string;
}

export interface DBProfile { id: string; email: string | null; display_name: string | null; avatar_url: string | null; bio: string | null; disabled: boolean; created_at: string; }

export interface DBInvite { id: string; code: string; created_by: string | null; max_uses: number; used_count: number; expires_at: string | null; disabled: boolean; note: string | null; created_at: string; }

export interface DBAppSettings {
  id: boolean;
  signup_requires_invite: boolean;
  hcaptcha_site_key: string | null;
  s3_endpoint: string | null;
  s3_region: string | null;
  s3_bucket: string | null;
  s3_access_key_id: string | null;
  s3_secret_access_key: string | null;
  s3_force_path_style: boolean;
  s3_public_base_url: string | null;
}

// =============== Hooks ===============
function useTable<T>(table: string, opts?: { order?: { column: string; ascending?: boolean }; realtime?: boolean }) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    let q = supabase.from(table).select("*");
    if (opts?.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? false });
    const { data, error } = await q;
    if (error) setError(error.message); else setData((data ?? []) as T[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  useEffect(() => {
    reload();
    if (!opts?.realtime) return;
    const ch = supabase.channel(`rt:${table}`).on("postgres_changes", { event: "*", schema: "public", table }, reload).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { data, loading, error, reload };
}

export const useCategories = () => useTable<DBCategory>("categories", { order: { column: "name", ascending: true } });
export const useScripts = () => useTable<DBScript>("scripts", { order: { column: "updated_at" } });
export const useRuns = () => useTable<DBRun>("runs", { order: { column: "started_at" }, realtime: true });
export const useWorkers = () => useTable<DBWorker>("workers", { order: { column: "name", ascending: true }, realtime: true });
export const useInvites = () => useTable<DBInvite>("invite_codes", { order: { column: "created_at" } });

export function useScript(slug: string) {
  const [data, setData] = useState<DBScript | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("scripts").select("*").eq("slug", slug).maybeSingle();
    setData((data as DBScript) ?? null);
    setLoading(false);
  }, [slug]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function useRun(id: string) {
  const [data, setData] = useState<DBRun | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from("runs").select("*").eq("id", id).maybeSingle();
      if (mounted) setData((data as DBRun) ?? null);
    };
    load();
    const ch = supabase.channel(`rt:run:${id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "runs", filter: `id=eq.${id}` },
      (payload) => { if (mounted) setData(payload.new as DBRun); }
    ).subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [id]);
  return data;
}

export function useRunLogs(runId: string) {
  const [logs, setLogs] = useState<DBRunLog[]>([]);
  useEffect(() => {
    let mounted = true;
    supabase.from("run_logs").select("*").eq("run_id", runId).order("id", { ascending: true })
      .then(({ data }) => { if (mounted) setLogs((data ?? []) as DBRunLog[]); });
    const ch = supabase.channel(`rt:logs:${runId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "run_logs", filter: `run_id=eq.${runId}` },
      (payload) => { if (mounted) setLogs((prev) => [...prev, payload.new as DBRunLog]); }
    ).subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [runId]);
  return logs;
}

export function useAppSettings() {
  const [data, setData] = useState<DBAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();
    setData((data as DBAppSettings) ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function usePublicSettings() {
  const [data, setData] = useState<{ signup_requires_invite: boolean; hcaptcha_site_key: string | null } | null>(null);
  useEffect(() => {
    supabase.from("public_settings").select("*").maybeSingle().then(({ data }) => setData(data as any));
  }, []);
  return data;
}
