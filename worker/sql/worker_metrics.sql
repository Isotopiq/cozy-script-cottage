-- =====================================================================
-- WORKER METRICS — resource monitoring time series
-- Run this AFTER scripthub_schema.sql. Idempotent, safe to re-run.
-- =====================================================================

create table if not exists public.worker_metrics (
  id            bigserial primary key,
  worker_id     uuid not null references public.workers(id) on delete cascade,
  ts            timestamptz not null default now(),
  cpu_pct       real,        -- 0..100, average across cores
  mem_used_mb   real,
  mem_total_mb  real,
  disk_used_gb  real,
  disk_total_gb real,
  net_rx_bps    real,        -- bytes/sec since last sample
  net_tx_bps    real,
  load_1m       real
);

create index if not exists worker_metrics_worker_ts_idx
  on public.worker_metrics (worker_id, ts desc);

alter table public.worker_metrics enable row level security;

drop policy if exists "worker_metrics read auth" on public.worker_metrics;
create policy "worker_metrics read auth" on public.worker_metrics
  for select to authenticated using (true);

-- Inserts come from the worker using the service role key (bypasses RLS).
-- No insert policy is needed for clients.

-- Realtime: stream new samples to the admin GUI.
do $$ begin
  alter publication supabase_realtime add table public.worker_metrics;
exception when duplicate_object then null; when others then null; end $$;

-- Retention: prune anything older than 24h. The worker calls this
-- opportunistically every ~100 inserts so no pg_cron is required.
create or replace function public.prune_worker_metrics()
returns void language sql security definer set search_path = public as $$
  delete from public.worker_metrics where ts < now() - interval '24 hours';
$$;

revoke all on function public.prune_worker_metrics() from public;
grant execute on function public.prune_worker_metrics() to authenticated, service_role;
