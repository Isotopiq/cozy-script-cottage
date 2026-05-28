## Goal

Replace the mock REPL with a real interactive Python/R session executed inside a connected worker, end-to-end, on the first try. Use Supabase as the message bus so the worker keeps its outbound-only network model (consistent with how `runs` / `run_logs` already work).

## Architecture

```text
Browser (REPL page)              Supabase                      VPS Worker
─────────────────────────         ──────────                    ──────────
1. Click Start  ──── insert ───►  repl_sessions             ◄── Realtime sub
                                  (status='requested')          claim → spawn
                                                                python3 -iu / R
2. Realtime sub on               repl_io  ◄──── insert ─── stdout/stderr
   repl_io (kind=out|err|sys)         ▲       (kind=out|err|sys)
   → write to xterm                   │
3. User types + Enter ─── insert ─────┘  ───── Realtime sub ──► write to child stdin
   into repl_io (kind=in)         (kind=in)

4. Click Stop ─── update ────►   repl_sessions               worker kills child,
                                 (stop_requested=true)        marks stopped
```

This reuses every primitive already proven in production (Realtime, RLS, service-role worker, restricted env spawning) so there's no new attack surface or new transport to harden.

## Database changes — new file `worker/sql/repl_schema.sql` (idempotent)

```sql
-- 1. Sessions
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

-- One running session per user (enforced server-side)
create unique index if not exists repl_sessions_one_active_per_user
  on public.repl_sessions(user_id) where status in ('requested','running');

create index if not exists repl_sessions_claim_idx
  on public.repl_sessions(status, created_at) where worker_id is null;

-- 2. I/O stream
create table if not exists public.repl_io (
  id bigserial primary key,
  session_id uuid not null references public.repl_sessions(id) on delete cascade,
  kind text not null check (kind in ('in','out','err','sys')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists repl_io_session_idx on public.repl_io(session_id, id);

-- 3. RLS
alter table public.repl_sessions enable row level security;
alter table public.repl_io       enable row level security;

create policy "owner can read sessions"   on public.repl_sessions
  for select to authenticated using (user_id = auth.uid());
create policy "owner can create sessions" on public.repl_sessions
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_account_active(auth.uid())
  );
create policy "owner can stop own session" on public.repl_sessions
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owner can read io"   on public.repl_io
  for select to authenticated using (
    exists (select 1 from public.repl_sessions s
            where s.id = session_id and s.user_id = auth.uid())
  );
create policy "owner can write input" on public.repl_io
  for insert to authenticated with check (
    kind = 'in' and exists (
      select 1 from public.repl_sessions s
      where s.id = session_id and s.user_id = auth.uid()
        and s.status = 'running'
    )
  );

-- 4. Realtime
alter publication supabase_realtime add table public.repl_sessions;
alter publication supabase_realtime add table public.repl_io;
```

Service role used by the worker bypasses RLS, so it can claim, stream output, and finalize without extra policies.

## Worker changes

New file `worker/src/repl.ts`:

* Subscribe (Realtime) to `repl_sessions` inserts where `worker_id is null and status='requested'`. On event, atomically claim with `update … set status='running', worker_id=…, claimed_at=now() where id=… and status='requested' returning *`. Per-worker concurrency cap (e.g. max 4) to avoid runaway processes.
* Spawn child:
  * Python: `python3 -iu` (unbuffered, interactive)
  * R: `R --no-save --quiet --interactive` with `options(prompt="", continue="")`
* Use the same restricted env allowlist already used by `executeRun` (PATH/HOME/TMPDIR/LANG/LC_ALL — never `SUPABASE_*` or `WORKER_ID`).
* Subscribe to `repl_io` inserts where `session_id=<sid> and kind='in'` → write `content + "\n"` to child stdin; update `repl_sessions.last_activity_at`.
* Pipe child stdout/stderr line by line → `repl_io.insert({session_id, kind:'out'|'err', content})`. Truncate >8000 chars.
* Idle timeout 15 min (configurable `REPL_IDLE_TIMEOUT_MS`), wallclock cap 60 min.
* Poll `stop_requested` every 2s (cheap single-row select); when true OR child exits OR idle/wallclock expires → SIGKILL + `update repl_sessions set status='stopped', stopped_at=now()` + emit a `kind='sys'` row "session ended".
* On worker shutdown (existing SIGTERM handler), mark every running session it owns as stopped.

Wire into `worker/src/index.ts`: `import { startReplManager } from "./repl"; startReplManager(sb, WORKER_ID);` inside `loop()` next to the existing `setInterval`s.

Add to `worker/.env.example`:
```
# Optional REPL tuning
REPL_MAX_CONCURRENT=4
REPL_IDLE_TIMEOUT_MS=900000
REPL_WALL_TIMEOUT_MS=3600000
```

Update `worker/README.md` — one new bullet under "What it does": "Hosts interactive Python/R REPL sessions for the UI, gated by RLS, with idle/wallclock timeouts."

## Frontend changes — rewrite `src/routes/_authenticated.repl.tsx`

* Remove all mock evaluation.
* `start()`:
  1. Insert `repl_sessions { language, user_id }`. Catch the unique-index violation → toast "You already have an active session" and offer a Stop existing button.
  2. Subscribe to that session row (Realtime) — when `status='running'` print "session connected on worker <name>" and enable input.
  3. Subscribe to `repl_io` filtered by `session_id` ordered by id; render `out`/`err`/`sys` lines (color stderr red, sys dim).
  4. Backfill any rows inserted before the subscription attached (single SELECT ordered by id ascending; track the last id to dedupe with stream).
* On Enter: insert `repl_io { session_id, kind:'in', content: line }`. Echo locally first for snappy UX. Disable input until session is `running`.
* `stop()`: update `repl_sessions set stop_requested=true` for the active session, unsubscribe channels, dispose terminal.
* On unmount or page navigation, also flip `stop_requested` so we don't leak background sessions.
* Remove the "mock" tip line; replace with "Connected to worker • idle timeout 15 min".
* Show a clear empty state when no online worker exists (`select count(*) from workers where status='online'` = 0): button stays disabled with tooltip "No worker online".

## Security checklist (already satisfied by design above)

* RLS: owners read/write only their session + io; only `kind='in'` allowed from clients; only when session is `running`.
* Disabled accounts: `is_account_active(auth.uid())` check blocks new sessions; worker double-checks on claim.
* No secret leakage: child env identical to existing run executor's restricted set.
* DoS: unique partial index = 1 active session per user; per-worker concurrency cap; idle + wallclock timeouts; 8000-char input cap; line-rate-limit could be added later if needed.
* Transport: zero new ports — everything rides Supabase Realtime over outbound HTTPS, same as `runs`.

## Steps (implementation order)

1. Add `worker/sql/repl_schema.sql` and run it in Supabase.
2. Add `worker/src/repl.ts` and wire into `worker/src/index.ts`. Bump worker version, rebuild container on the VPS.
3. Replace `src/routes/_authenticated.repl.tsx` with the live version.
4. Manual verification:
   * Open `/repl`, click Start → session row appears with `status='requested'`, then `'running'` within ~1s.
   * Type `print("hi")` → "hi" prints; `1/0` → ZeroDivisionError on stderr (red).
   * Open the same page in a 2nd tab → blocked with "active session" toast.
   * Click Stop → child dies, status='stopped', input disabled.
   * Idle 15 min → session auto-stops with sys message.
   * Disable a profile in admin → that user's Start fails with a clean error.

## Files touched

* New: `worker/sql/repl_schema.sql`
* New: `worker/src/repl.ts`
* Edited: `worker/src/index.ts` (wire manager + shutdown cleanup)
* Edited: `worker/.env.example` (3 new optional vars)
* Edited: `worker/README.md` (one bullet)
* Rewritten: `src/routes/_authenticated.repl.tsx`

No changes to existing `runs`/`scripts`/auth flows — REPL is additive and isolated.
