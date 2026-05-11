-- =====================================================================
-- Security patch — May 2026
-- Idempotent; safe to re-run. Apply in Supabase SQL editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tighten runs UPDATE policy (PUBLIC_DATA_EXPOSURE)
--    Non-admin run owners must not be able to forge status/output/etc.
--    Only admins (and the worker via service-role) may mutate runs.
--    Owners may still cancel their own queued/running runs.
-- ---------------------------------------------------------------------
drop policy if exists "runs admin update" on public.runs;
create policy "runs admin update" on public.runs
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or (auth.uid() = triggered_by and status in ('queued', 'running'))
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or (auth.uid() = triggered_by and status = 'canceled')
  );

-- ---------------------------------------------------------------------
-- 2) Server-side invite enforcement (CLIENT_SIDE_AUTH bypass)
--    Move invite consumption into handle_new_user so it runs atomically
--    on every auth.users insert, regardless of email-confirmation flow.
--    Invite code is passed via signUp({ options: { data: { invite_code }}}).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing int;
  reqd boolean;
  code text;
  row_id uuid;
begin
  -- Determine if invites are required.
  select signup_requires_invite into reqd from public.app_settings where id = true;

  -- First user ever bypasses invite requirement and becomes admin.
  select count(*) into existing from public.user_roles;

  -- Admin/dashboard inserts run as service_role and must keep working even
  -- when invites are required. Only the public signup path (anon/authenticated)
  -- is subject to the strict invite check below.
  if reqd and existing > 0 and current_setting('role', true) <> 'service_role' then
    code := nullif(new.raw_user_meta_data->>'invite_code', '');
    if code is null then
      raise exception 'Invite code required' using errcode = '28000';
    end if;
    select id into row_id from public.invite_codes
      where invite_codes.code = code
        and disabled = false
        and (expires_at is null or expires_at > now())
        and used_count < max_uses
      for update;
    if row_id is null then
      raise exception 'Invalid or expired invite code' using errcode = '28000';
    end if;
    update public.invite_codes set used_count = used_count + 1 where id = row_id;
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  if existing = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'viewer')
      on conflict do nothing;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3) Disabled account enforcement (CLIENT_SIDE_AUTH)
--    Helper used by the client + can be referenced from sensitive RLS.
-- ---------------------------------------------------------------------
create or replace function public.is_account_active(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(not p.disabled, true) from public.profiles p where p.id = _uid
$$;
revoke all on function public.is_account_active(uuid) from public;
grant execute on function public.is_account_active(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) S3 secret exposure (SECRETS_EXPOSED)
--    Remove s3_secret_access_key from the row returned to admin browsers.
--    A masked view exposes only whether a secret is configured. The actual
--    secret must be re-entered by an admin to update or test the connection.
-- ---------------------------------------------------------------------
create or replace view public.app_settings_safe as
  select
    id,
    signup_requires_invite,
    hcaptcha_site_key,
    s3_endpoint,
    s3_region,
    s3_bucket,
    s3_access_key_id,
    s3_force_path_style,
    s3_public_base_url,
    (s3_secret_access_key is not null and length(s3_secret_access_key) > 0) as s3_secret_configured,
    updated_at
  from public.app_settings
  where id = true;
grant select on public.app_settings_safe to authenticated;

-- Admin-only update RPC that only writes the secret when a non-empty value
-- is provided, so the masked client form can omit it on save.
create or replace function public.update_app_settings(
  _signup_requires_invite boolean,
  _hcaptcha_site_key text,
  _s3_endpoint text,
  _s3_region text,
  _s3_bucket text,
  _s3_access_key_id text,
  _s3_secret_access_key text,
  _s3_force_path_style boolean,
  _s3_public_base_url text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.app_settings set
    signup_requires_invite = coalesce(_signup_requires_invite, signup_requires_invite),
    hcaptcha_site_key      = _hcaptcha_site_key,
    s3_endpoint            = _s3_endpoint,
    s3_region              = _s3_region,
    s3_bucket              = _s3_bucket,
    s3_access_key_id       = _s3_access_key_id,
    s3_secret_access_key   = case
                               when _s3_secret_access_key is null or _s3_secret_access_key = ''
                                 then s3_secret_access_key
                               else _s3_secret_access_key
                             end,
    s3_force_path_style    = coalesce(_s3_force_path_style, s3_force_path_style),
    s3_public_base_url     = _s3_public_base_url,
    updated_at             = now()
  where id = true;
end $$;
revoke all on function public.update_app_settings(boolean,text,text,text,text,text,text,boolean,text) from public;
grant execute on function public.update_app_settings(boolean,text,text,text,text,text,text,boolean,text) to authenticated;
