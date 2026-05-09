
# Script Hub — Full Build Plan (BYO Supabase)

You'll plug in your own Supabase project at the end. Until then, the app runs against a typed mock data layer that mirrors the eventual Supabase schema 1:1, so the swap at the end is a config + client change, not a rewrite.

## Important constraints (unchanged)

- Lovable's serverless runtime cannot execute Python/R or run Docker. Real execution requires an **external worker** you host (reference impl included in `worker/`).
- The portal is the **control plane**: CMS, queue, results, REPL frontend, dashboard. The worker is the **data plane**.
- Auth, DB, storage, realtime → your Supabase instance (added last).

## Feature scope

1. Auth (email/password + Google) with `admin` / `viewer` roles via separate `user_roles` table + `has_role()` security-definer fn.
2. Script CMS — name, description, language (python/r), category, tags, source (Monaco editor), JSON param schema, output type (text/table/chart/shiny), packages, timeout.
3. Categorization, search, favorites.
4. Run UI — param form, Run button, live-streaming logs, rendered output (text / tanstack-table / recharts / iframe for Shiny).
5. Dashboard — recent runs, status badges, worker health, quick re-run, charts of run volume.
6. Run history & artifacts (files in Supabase Storage).
7. Shiny / GUI script type — worker starts container, returns proxied URL, portal embeds in sandboxed iframe with auto-shutdown timer.
8. Web REPL — xterm.js terminal over WS to worker, admin-only.
9. Worker management — register URL + shared secret, heartbeat, queue depth.

## Design

- Dark-default editorial dashboard. Collapsible sidebar (Dashboard, Scripts, Categories, Runs, REPL, Workers, Settings). Top bar with global run-status pill.
- Distinctive look: monospaced display headings (JetBrains Mono), Inter body, accent gradient on primary, terminal-green status accents. All tokens in `src/styles.css` (oklch).
- Script cards with language chip, last-run status, run count. Run page is split: params/code left, live log + output right.

## Architecture

```text
Browser (TanStack Start)
   │  TanStack server fns
   ▼
Your Supabase
  ├── Postgres (schema below) + RLS
  ├── Storage (run artifacts, attachments)
  └── Auth + realtime
   │  signed HTTP + WS
   ▼
External Worker (your VM / Fly / Railway)
  /enqueue  /runs/:id/stream(WS)  /repl(WS)  /shiny/start  /shiny/stop
```

## Data model

- `categories(id, name, slug, color)`
- `scripts(id, slug, name, description, language, category_id, source, params_schema jsonb, output_type, packages text[], timeout_s, created_by, timestamps)`
- `script_tags(script_id, tag)`
- `runs(id, script_id, triggered_by, status, params jsonb, started_at, finished_at, exit_code, duration_ms, output_summary jsonb, artifact_paths text[])`
- `run_logs(id, run_id, ts, stream, line)` — append-only, realtime channel
- `workers(id, name, base_url, secret_hash, last_seen_at, status, capabilities jsonb)`
- `repl_sessions(id, user_id, worker_id, language, status, timestamps)`
- `app_role` enum + `user_roles(user_id, role)` + `has_role()` SECURITY DEFINER
- RLS: viewers read scripts/categories/tags + own runs + insert runs; admins full access; service role used by worker-callback server routes.

## Mock data layer (used until Supabase is wired)

`src/integrations/db/` exposes the same surface the Supabase client will:
- `db.scripts.list/get/create/update/delete`
- `db.runs.list/get/create/appendLog/finish`
- `db.categories.*`, `db.workers.*`, `db.replSessions.*`, `db.auth.*`
Backed by an in-memory store + a tiny event bus that simulates realtime log streaming (so the run page actually shows lines arriving). Includes seed data: 6 sample scripts across Python/R, a few past runs, one fake worker.

When you provide Supabase, this module becomes a thin adapter over `@supabase/supabase-js` and worker HTTP — no component changes.

## Server surface (TanStack)

Server functions (`src/lib/*.functions.ts`, thin):
- scripts CRUD, runs list/get/start/cancel, workers CRUD, repl start/stop.

Server routes (`src/routes/api/...`):
- `api/public/runs/$runId/ingest` — HMAC-verified worker callback (logs/artifacts/status).
- `api/public/workers/heartbeat` — health pings.
- `api/repl/$sessionId` — auth-gated WS proxy stub (issues short-lived signed token; browser connects directly to worker WS).

Until Supabase is in, these handlers operate on the in-memory store.

## Pages / routes

- `/login`, `/signup`, `/reset-password` (forms work against mock now, real auth at end)
- `/_authenticated/`
  - `/` Dashboard
  - `/scripts` list + filters
  - `/scripts/$slug` run/detail
  - `/scripts/new`, `/scripts/$slug/edit` (admin)
  - `/categories` (admin)
  - `/runs`, `/runs/$id`
  - `/repl` (admin)
  - `/workers` (admin)
  - `/settings`

## Reference worker (delivered, optional to deploy)

`worker/` directory:
- `Dockerfile` (Node 20 + Python 3.11 + R + Docker CLI)
- `server.ts` Hono app: `/enqueue`, `/runs/:id/stream`, `/repl`, `/shiny/start|stop`, heartbeat
- `runners/python.ts`, `runners/r.ts` — child_process streaming
- `runners/shiny.ts` — `docker run` lifecycle
- `repl.ts` — node-pty over WS
- `README.md` — Fly.io / Railway / bare-VM deploy

## Implementation phases

1. **Foundation & design system** — tokens, fonts, sidebar shell, `_authenticated` layout with mock auth + role helpers, login/signup pages.
2. **Mock data layer + types** — schema-shaped store, seed data, simulated realtime.
3. **Script CMS** — list, detail, create/edit (Monaco), categories, tags, search.
4. **Runs** — run page (param form, live log via simulated stream, output renderers: text, table, chart, shiny iframe placeholder), run history, run detail.
5. **Dashboard** — recent runs, status widgets, worker health, run-volume chart.
6. **REPL** — xterm.js page wired to mock REPL stream (echo + fake interpreter), ready to point at a real worker WS.
7. **Workers admin** — register/list/rotate-secret, heartbeat status.
8. **Reference worker repo** under `worker/`.
9. **Polish** — empty/error/loading states, mobile pass, SEO meta per route, 404/error boundaries.
10. **Supabase swap (final, when you provide credentials)** — enable client, run migrations (schema + RLS + roles + storage buckets + triggers), replace `src/integrations/db/` internals with Supabase calls + realtime channels, wire real auth, configure Google OAuth, add HMAC secret for worker callbacks.

## Open items / risks

- WebSockets in the serverless runtime are limited; REPL and live logs will connect from the browser directly to your worker over WS, with a short-lived signed token issued by a server fn. Documented in worker README.
- "Seamless Shiny embed" needs your worker host to terminate TLS on a wildcard subdomain you own; covered in worker README.
- Until Supabase is wired, all data is per-browser-session (in-memory). That's intentional for the build phase.

Hit Implement and I'll start with phase 1.
