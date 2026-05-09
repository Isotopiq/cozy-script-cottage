## Goal

Move Script Hub from a half-mock prototype to a real multi-user app on your self-hosted Supabase + a Docker worker on your VPS, with admin user management, invite-gated signup, hCaptcha, password reset, profile editing, and admin-configurable S3. Nothing locks you to Lovable — every secret is a plain env var that ports to any host.

---

## 1. Database additions (SQL you run on your Supabase)

I'll write `/mnt/documents/scripthub_schema_part2.sql`:

- `invite_codes` (code, created_by, expires_at, max_uses, used_count, disabled)
- `app_settings` singleton: `signup_requires_invite bool`, `hcaptcha_site_key`, S3 fields (`s3_endpoint`, `s3_region`, `s3_bucket`, `s3_access_key_id`, `s3_secret_access_key`, `s3_force_path_style`, `s3_public_base_url`)
- `profiles` extended with `avatar_url`, `display_name`, `bio` (owner-editable)
- `worker_tokens` (hashed bearer tokens)
- RLS: only admins read/write `invite_codes`, `app_settings`, `worker_tokens`; users update only their own profile
- `consume_invite(code)` security-definer RPC (atomic increment + validity check)

## 2. Make yourself admin (one-time)

After first signup, run in Supabase SQL editor:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'YOUR_EMAIL'
on conflict do nothing;
```

## 3. Auth & registration

- **hCaptcha** (Supabase native): enable in Supabase dashboard → Auth → Settings → Captcha (hCaptcha). Frontend renders `@hcaptcha/react-hcaptcha` on `/signup`, `/login`, `/forgot-password` and passes the token via `options.captchaToken`.
- **Invite codes**: signup form shows the field when `app_settings.signup_requires_invite=true`. After successful `signUp`, frontend calls `consume_invite()` RPC; failure deletes the new user and shows an error.
- **Forgot/reset password**: new public `/forgot-password` and `/reset-password` routes using `resetPasswordForEmail` + `updateUser({ password })`.
- **Profile editor**: `_authenticated.profile.tsx` for editing display name, bio, avatar (uploaded to a Supabase `avatars` bucket).

## 4. Admin panel

New routes under `_authenticated/admin/`, gated by `isAdmin`. Sidebar shows an Admin section only for admins.

- `/admin` — overview cards (users, invites, worker status, S3 status)
- `/admin/users` — list, change role, disable, delete (server function with service role key)
- `/admin/invites` — generate / copy / revoke; toggle "require invite" globally
- `/admin/storage` — set S3 endpoint, region, bucket, keys, path-style; "Test connection" button
- `/admin/workers` — list workers, generate worker tokens, revoke

## 5. Remove all mock data

- Delete `src/lib/mock-db.ts` and seed data.
- Replace with focused Supabase hooks: `useScripts`, `useRuns`, `useRunLogs` (realtime), `useCategories`, `useWorkers`, `useAdminUsers`, `useAppSettings`, `useInvites`.
- Replace `src/hooks/use-auth.ts` with a Supabase-backed version.
- Run creation = insert a `runs` row with `status='queued'`; the worker picks it up.
- Run detail page subscribes to `run_logs` Realtime channel for live streaming.

## 6. S3 uploads (any S3-compatible: AWS, MinIO, R2, B2)

- Server function `getS3PresignedUrl({ kind, key })` reads `app_settings`, signs a PUT URL using AWS SigV4. Admin-only for script files; owner-only for artifacts.
- Script editor gets an "Upload file" button that uses the presigned URL.
- The worker reads the same `app_settings` row to fetch inputs / push artifacts.

## 7. Worker on your VPS (Docker Compose, pull model)

New `worker/` folder:

```
worker/
  Dockerfile           # python 3.12 + R + bash + pandas/numpy/scikit-learn
  docker-compose.yml
  worker.py
  requirements.txt
  .env.example
  README.md
```

**How it works (no inbound ports needed):**
1. Worker auths to Supabase using the service role key (kept in `.env` on the VPS only).
2. Subscribes to Realtime on `runs` where `status='queued'`.
3. Atomically claims a run (`update ... where status='queued' returning *`).
4. Writes script source + params to a temp dir, runs python/R/bash, streams stdout/stderr line-by-line into `run_logs` (frontend subscribes live).
5. Uploads artifacts to S3 from `app_settings`, updates `runs.status`, `output`, `exit_code`.
6. Heartbeats `workers.last_seen_at` every 10s.

**Deploy on your VPS:**
```bash
git clone <your-repo> scripthub && cd scripthub/worker
cp .env.example .env   # edit SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_NAME
docker compose up -d --build
docker compose logs -f
```

The README walks through registering the worker in `/admin/workers` and verifying it goes online.

## 8. Lovable independence

Everything sensitive is a plain `process.env.*` var or a row in your own Supabase. Lovable's secrets tool just injects env vars at runtime — moving to Vercel/Cloudflare/your VPS is `cp .env`. No Lovable-only APIs are used.

## 9. Secret I'll request when needed

**`SUPABASE_SERVICE_ROLE_KEY`** — used by admin server functions (delete user, etc.) and by the VPS worker.

**Where to find it:** open your self-hosted Supabase Studio (the `easypanel.host` URL) → click **Project Settings** (gear icon, bottom-left) → **API** → under "Project API keys" copy the key labeled **`service_role` / `secret`** (NOT `anon`). On a self-hosted stack it's also the `SERVICE_ROLE_KEY` env var in your Supabase docker-compose `.env`. Treat it like a root password — never paste it into client code or commit it.

S3 credentials are NOT stored as Lovable secrets — they live in `app_settings` so admins rotate them from the UI.

## 10. Files

**New routes**: `forgot-password.tsx`, `reset-password.tsx`, `_authenticated.profile.tsx`, `_authenticated.admin.tsx`, `_authenticated.admin.index.tsx`, `_authenticated.admin.users.tsx`, `_authenticated.admin.invites.tsx`, `_authenticated.admin.storage.tsx`, `_authenticated.admin.workers.tsx`.

**New libs**: `src/lib/hooks/use-*.ts`, `src/lib/server/s3-presign.functions.ts`, `src/lib/server/admin-users.functions.ts`, `src/lib/captcha.tsx`.

**Schema**: `/mnt/documents/scripthub_schema_part2.sql`.

**Worker repo folder**: `worker/` with Dockerfile, compose, worker.py, README.

**Edited**: `signup.tsx`, `login.tsx`, `_authenticated.tsx`, `app-sidebar.tsx`, all script/run pages.

**Deleted**: `src/lib/mock-db.ts`, old `src/hooks/use-auth.ts`.

## 11. Implementation order

1. SQL part 2 + run instructions
2. Replace mock-db with real Supabase hooks
3. Admin panel (users / invites / storage / workers)
4. Captcha + invite-gated signup + forgot/reset password + profile editor
5. S3 presign server fn + upload UI
6. Worker repo (Dockerfile, compose, worker.py, README)
7. Cleanup
