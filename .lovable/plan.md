## Goal
You asked me to make sure the security fixes I just applied don't break existing app features. I re-audited every call site touched by the patches. Below is what's safe, what carries a real behavior risk, and the small adjustments I recommend.

## Audit results per fix

### 1. Worker env allowlist (`worker/src/index.ts`)
**Status:** Safe, but a behavior change for scripts.
- Scripts that depended on extra inherited env vars (`HTTP_PROXY`, `AWS_*`, user-defined vars, `PYTHONPATH`, etc.) will no longer see them. Today the project has no UI for per-script env vars, so nothing in the current codebase relies on this.
- **Adjustment:** add an optional `EXTRA_ENV_ALLOWLIST` env var (comma-separated names) in `worker/src/index.ts` so an operator can opt extra keys back in on a specific VPS without re-leaking secrets. Default empty = current strict behavior. Document in `worker/.env.example` and `worker/README.md`.

### 2. Runs UPDATE RLS (`worker/sql/security_patch_2026_05.sql`)
**Status:** Safe.
- I searched every client-side update path: no component anywhere calls `supabase.from("runs").update(...)`. Only the worker (service role, bypasses RLS) and admins write to `runs`. The new policy still allows owner self-cancel for the future cancel UI you mentioned earlier.
- **No change needed.**

### 3. Disabled-account enforcement (`useAuth`)
**Status:** Safe, one tiny polish.
- Sign-out + redirect on `profiles.disabled = true` only fires for accounts an admin explicitly disabled. No existing flow relies on a disabled account staying logged in.
- The redirect goes to `/login?disabled=1` but `src/routes/login.tsx` doesn't display a message for that param.
- **Adjustment:** read the `disabled=1` query param on `/login` and show a small banner ("This account has been disabled. Contact an administrator."). Cosmetic only — no functional risk.

### 4. Invite enforcement moved into `handle_new_user` trigger
**Status:** Functional risk — needs one safety net.
- Today, with `signup_requires_invite = true`, the trigger throws if `invite_code` is missing/invalid. The signup form passes it correctly, so the normal path works.
- **Risk:** if you ever create a user from the Supabase dashboard (or via the admin API) without setting `raw_user_meta_data.invite_code`, the insert now fails. That's stricter than before and could surprise an admin.
- **Adjustment:** in the trigger, bypass the invite requirement when the inserting role is `service_role` (i.e. admin/dashboard creation). The signup path (anon/authenticated key) still gets the strict enforcement that closes the bypass. Concretely:
  ```sql
  if reqd and existing > 0 and current_setting('role') <> 'service_role' then ...
  ```
- Keep the legacy `consume_invite(text)` RPC in place (no client calls it any more) so anyone who re-runs `scripthub_schema.sql` doesn't error.

### 5. S3 secret no longer reaches the browser
**Status:** Works, but one UX edge case.
- Save flow now goes through `update_app_settings` RPC (verified — only one writer in the codebase).
- Read flow now uses `app_settings_safe` view (no secret column) — verified only `useAppSettings` consumes this and only on the admin Storage page.
- **Edge case:** the "Test S3 connection" button needs the secret in memory. After save, the form clears the secret field, so testing again later requires the admin to re-enter it. This is the intended security trade-off; I'll add a one-line hint to the UI so it's not confusing.
- **Adjustment:** small inline hint under the secret field explaining "Re-enter to test or rotate."

## Plan of changes (small, additive)
1. `worker/src/index.ts` — add `EXTRA_ENV_ALLOWLIST` parsing; merge those env keys into the allowlist if set. No behavior change when unset.
2. `worker/.env.example` + `worker/README.md` — document `EXTRA_ENV_ALLOWLIST`.
3. `worker/sql/security_patch_2026_05.sql` — change the `handle_new_user` invite check to skip when `current_setting('role') = 'service_role'` so admin/dashboard inserts keep working.
4. `src/routes/login.tsx` — render a small banner when `?disabled=1` is present (cosmetic, behind a query check, no auth logic change).
5. `src/routes/_authenticated.admin.storage.tsx` — already says "Re-enter to change/test"; tighten copy to make it obvious. No logic change.

## Technical details
- Item 3 keeps the public-facing signup path strict (anon/authenticated role) while restoring admin-side flexibility. This is the same pattern Supabase trigger code commonly uses to detect dashboard-originated inserts.
- Items 1, 2, 4, 5 are non-functional or documentation tweaks; they cannot regress any current feature.

After these adjustments are applied, all five fixes remain in force and there are no known regressions to existing functionality.