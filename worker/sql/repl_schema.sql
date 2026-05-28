-- =====================================================================
-- SCRIPT HUB — REPL schema (idempotent, safe to re-run)
-- Adds interactive Python / R session tables, RLS, grants, realtime.
-- Run in your self-hosted Supabase SQL editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. repl_sessions
-- ---------------------------------------------------------------
create table if not exists public.repl_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete set null,
  language text not null check (language in ('python','r')),
  status text not null default 'requested'
    check (status in ('requested','running','stopped','errored')),
  stop_requested boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  stopped_at timestamptz
);

-- One active session per user (atomic guard against duplicates)
create unique index if not exists repl_sessions_one_active_per_user
  on public.repl_sessions(user_id)
  where status in ('requested','running');

create index if not exists repl_sessions_claim_idx
  on public.repl_sessions(status, created_at)
  where worker_id is null and status = 'requested';

create index if not exists repl_sessions_worker_running_idx
  on public.repl_sessions(worker_id)
  where status = 'running';

-- ---------------------------------------------------------------
-- 2. repl_io  (in = user input, out/err = child output, sys = system msg)
-- ---------------------------------------------------------------
create table if not exists public.repl_io (
  id bigserial primary key,
  session_id uuid not null references public.repl_sessions(id) on delete cascade,
  kind text not null check (kind in ('in','out','err','sys')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists repl_io_session_idx on public.repl_io(session_id, id);
create index if not exists repl_io_unprocessed_input_idx
  on public.repl_io(session_id, id)
  where kind = 'in';

-- ---------------------------------------------------------------
-- 3. Grants  (PostgREST needs explicit privileges in addition to RLS)
-- ---------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on public.repl_sessions to authenticated;
grant all on public.repl_sessions to service_role;

grant select, insert on public.repl_io to authenticated;
grant all on public.repl_io to service_role;
grant usage, select on sequence public.repl_io_id_seq to authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
alter table public.repl_sessions enable row level security;
alter table public.repl_io       enable row level security;

drop policy if exists "repl_sessions owner read"   on public.repl_sessions;
drop policy if exists "repl_sessions owner insert" on public.repl_sessions;
drop policy if exists "repl_sessions owner update" on public.repl_sessions;

create policy "repl_sessions owner read"
  on public.repl_sessions for select to authenticated
  using (user_id = auth.uid());

create policy "repl_sessions owner insert"
  on public.repl_sessions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_account_active(auth.uid())
    and status = 'requested'
    and worker_id is null
  );

-- Owner may flip stop_requested on their own session; cannot promote status etc.
create policy "repl_sessions owner update"
  on public.repl_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "repl_io owner read"        on public.repl_io;
drop policy if exists "repl_io owner write input" on public.repl_io;

create policy "repl_io owner read"
  on public.repl_io for select to authenticated
  using (
    exists (
      select 1 from public.repl_sessions s
      where s.id = repl_io.session_id and s.user_id = auth.uid()
    )
  );

-- Clients may only insert their own 'in' lines, and only while running.
create policy "repl_io owner write input"
  on public.repl_io for insert to authenticated
  with check (
    kind = 'in'
    and exists (
      select 1 from public.repl_sessions s
      where s.id = repl_io.session_id
        and s.user_id = auth.uid()
        and s.status = 'running'
    )
  );

-- ---------------------------------------------------------------
-- 5. Realtime publication
-- ---------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.repl_sessions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.repl_io;
exception when duplicate_object then null; end $$;
