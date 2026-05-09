## Continue the Script Hub build

The full plan was already approved earlier. Switching back to build mode so I can:

1. Request the `SUPABASE_SERVICE_ROLE_KEY` secret (the form was interrupted by a mode change last turn).
2. Resume implementation in this order:
   - Replace `mock-db` with real Supabase hooks (`useScripts`, `useRuns`, `useRunLogs` realtime, `useCategories`, `useWorkers`, `useAppSettings`, `useInvites`).
   - New `useAuth` backed by Supabase, with `isAdmin` from `user_roles`.
   - Admin panel routes: `/admin`, `/admin/users`, `/admin/invites`, `/admin/storage`, `/admin/workers`.
   - Auth flows: invite-gated signup with hCaptcha, `/forgot-password`, `/reset-password`, `/profile` editor.
   - Server functions: `s3-presign.functions.ts` (SigV4 via `aws4fetch`), `admin-users.functions.ts` (service role).
   - `worker/` repo folder with Dockerfile, docker-compose, `worker.py`, README for VPS deploy.
   - Delete `src/lib/mock-db.ts` and the old `src/hooks/use-auth.ts`.

The schema SQL is already at `/mnt/documents/scripthub_schema.sql` — run that on your Supabase before logging in for the first time. The first user to sign up becomes admin automatically.

Hit "Implement plan" to drop me into build mode and I'll request the secret form right away.
