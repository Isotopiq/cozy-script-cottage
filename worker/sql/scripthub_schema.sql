-- =====================================================================
-- SCRIPT HUB — full schema (idempotent, safe to re-run)
-- Run this in your self-hosted Supabase SQL editor.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$ begin
  create type public.app_role as enum ('admin','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.script_language as enum ('python','r','bash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.script_output_type as enum ('text','table','chart','shiny');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.run_status as enum ('queued','running','succeeded','failed','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.worker_status as enum ('online','offline','degraded');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- USER ROLES + has_role()  (separate table; required to avoid recursion)
-- =====================================================================
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

drop policy if exists "user_roles self read" on public.user_roles;
create policy "user_roles self read" on public.user_roles
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

drop policy if exists "user_roles admin all" on public.user_roles;
create policy "user_roles admin all" on public.user_roles
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- PROFILES
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  bio text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all" on public.profiles
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Auto-create profile + first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing int;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  select count(*) into existing from public.user_roles;
  if existing = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'viewer')
      on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- APP SETTINGS  (singleton, admin-only)
-- =====================================================================
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  signup_requires_invite boolean not null default true,
  hcaptcha_site_key text,
  s3_endpoint text,
  s3_region text,
  s3_bucket text,
  s3_access_key_id text,
  s3_secret_access_key text,
  s3_force_path_style boolean not null default true,
  s3_public_base_url text,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;
alter table public.app_settings enable row level security;

-- Public, NON-secret read view (so signup page can know if invite is required + site key)
create or replace view public.public_settings as
  select signup_requires_invite, hcaptcha_site_key from public.app_settings where id = true;
grant select on public.public_settings to anon, authenticated;

drop policy if exists "app_settings admin all" on public.app_settings;
create policy "app_settings admin all" on public.app_settings
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- INVITE CODES
-- =====================================================================
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  max_uses int not null default 1,
  used_count int not null default 0,
  expires_at timestamptz,
  disabled boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;

drop policy if exists "invite_codes admin all" on public.invite_codes;
create policy "invite_codes admin all" on public.invite_codes
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Atomic invite consumption (callable by authenticated user right after signUp)
create or replace function public.consume_invite(_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare row_id uuid; reqd boolean;
begin
  select signup_requires_invite into reqd from public.app_settings where id=true;
  if not reqd then return true; end if;

  select id into row_id from public.invite_codes
   where code = _code
     and disabled = false
     and (expires_at is null or expires_at > now())
     and used_count < max_uses
   for update;

  if row_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  update public.invite_codes set used_count = used_count + 1 where id = row_id;
  return true;
end $$;

revoke all on function public.consume_invite(text) from public;
grant execute on function public.consume_invite(text) to authenticated;

-- =====================================================================
-- CATEGORIES
-- =====================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text default 'var(--chart-1)',
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;

drop policy if exists "categories read all" on public.categories;
create policy "categories read all" on public.categories
  for select to authenticated using (true);

drop policy if exists "categories admin write" on public.categories;
create policy "categories admin write" on public.categories
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

insert into public.categories (name, slug, color) values
  ('Data Ops','data-ops','var(--chart-1)'),
  ('Analytics','analytics','var(--chart-2)'),
  ('ML','ml','var(--chart-3)'),
  ('Reporting','reporting','var(--chart-4)'),
  ('Utilities','utilities','var(--chart-5)')
on conflict (slug) do nothing;

-- =====================================================================
-- SCRIPTS
-- =====================================================================
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text default '',
  language public.script_language not null default 'python',
  category_id uuid references public.categories(id) on delete set null,
  source text not null default '',
  source_file_url text,
  params_schema jsonb not null default '[]'::jsonb,
  output_type public.script_output_type not null default 'text',
  packages text[] not null default '{}',
  tags text[] not null default '{}',
  timeout_s int not null default 60,
  favorite boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.scripts enable row level security;

drop policy if exists "scripts read all" on public.scripts;
create policy "scripts read all" on public.scripts
  for select to authenticated using (true);

drop policy if exists "scripts admin write" on public.scripts;
create policy "scripts admin write" on public.scripts
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists scripts_touch on public.scripts;
create trigger scripts_touch before update on public.scripts
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- WORKERS
-- =====================================================================
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.worker_status not null default 'offline',
  last_seen_at timestamptz,
  capabilities jsonb not null default '{"python":true,"r":true,"bash":true}'::jsonb,
  queue_depth int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.workers enable row level security;

drop policy if exists "workers read all" on public.workers;
create policy "workers read all" on public.workers
  for select to authenticated using (true);

drop policy if exists "workers admin write" on public.workers;
create policy "workers admin write" on public.workers
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Worker bearer tokens (stored hashed)
create table if not exists public.worker_tokens (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade,
  token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.worker_tokens enable row level security;

drop policy if exists "worker_tokens admin all" on public.worker_tokens;
create policy "worker_tokens admin all" on public.worker_tokens
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- RUNS
-- =====================================================================
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  triggered_by uuid references auth.users(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  status public.run_status not null default 'queued',
  params jsonb not null default '{}'::jsonb,
  exit_code int,
  duration_ms int,
  output jsonb,
  error_message text,
  artifact_keys text[] default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  claimed_at timestamptz
);
alter table public.runs enable row level security;
create index if not exists runs_status_idx on public.runs (status, started_at desc);
create index if not exists runs_script_idx on public.runs (script_id, started_at desc);

drop policy if exists "runs read all auth" on public.runs;
create policy "runs read all auth" on public.runs
  for select to authenticated using (true);

drop policy if exists "runs insert auth" on public.runs;
create policy "runs insert auth" on public.runs
  for insert to authenticated with check (auth.uid() = triggered_by);

drop policy if exists "runs admin update" on public.runs;
create policy "runs admin update" on public.runs
  for update to authenticated using (
    public.has_role(auth.uid(),'admin') or auth.uid() = triggered_by
  ) with check (true);

-- ---------- RUN LOGS ----------
create table if not exists public.run_logs (
  id bigserial primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  ts timestamptz not null default now(),
  stream text not null check (stream in ('stdout','stderr','system')),
  line text not null
);
alter table public.run_logs enable row level security;
create index if not exists run_logs_run_idx on public.run_logs (run_id, id);

drop policy if exists "run_logs read auth" on public.run_logs;
create policy "run_logs read auth" on public.run_logs
  for select to authenticated using (true);

-- =====================================================================
-- REALTIME PUBLICATIONS
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.runs;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.run_logs;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.workers;
exception when duplicate_object then null; when others then null; end $$;

-- =====================================================================
-- STORAGE BUCKETS  (avatars: public, scripts/artifacts: private)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('avatars','avatars',true),
       ('script-files','script-files',false),
       ('run-artifacts','run-artifacts',false)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar owner write" on storage.objects;
create policy "avatar owner write" on storage.objects
  for insert to authenticated with check (
    bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects
  for update to authenticated using (
    bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "script-files admin all" on storage.objects;
create policy "script-files admin all" on storage.objects
  for all to authenticated using (
    bucket_id='script-files' and public.has_role(auth.uid(),'admin')
  ) with check (
    bucket_id='script-files' and public.has_role(auth.uid(),'admin')
  );

drop policy if exists "run-artifacts read auth" on storage.objects;
create policy "run-artifacts read auth" on storage.objects
  for select to authenticated using (bucket_id='run-artifacts');

-- =====================================================================
-- DONE
-- =====================================================================
-- After signing up your first user, they will be made admin automatically.
-- If that didn't happen, run:
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'YOUR_EMAIL'
--   on conflict do nothing;
