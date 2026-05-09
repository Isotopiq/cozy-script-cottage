# Isotopiq Script Hub — Worker

This is the script-runner that you deploy on your own VPS. It connects to
your self-hosted Supabase, polls the `runs` table for queued runs, executes
the user-defined scripts (Python / R / Bash), and streams logs back into
Supabase Realtime — all over outbound HTTPS, so no inbound port is required.

---

## 1. Prerequisites on the VPS

* Docker Engine 24+ and the `docker compose` plugin (Compose v2).
* Outbound HTTPS access to your Supabase host.

```bash
# Debian / Ubuntu — install Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out + back in to apply
```

---

## 2. One-time database setup (Supabase)

Run the SQL below in your Supabase SQL editor. It is idempotent — safe to
re-run after upgrades. The complete schema is also bundled in this repo at
`worker/sql/scripthub_schema.sql`.

```bash
# From your laptop, you can also pipe the file directly to psql:
psql "$SUPABASE_DB_URL" -f worker/sql/scripthub_schema.sql
```

What it creates:

| Object | Purpose |
| --- | --- |
| `user_roles` + `has_role()` | Admin / viewer roles (separate table — required to avoid RLS recursion) |
| `profiles` + `handle_new_user()` trigger | Auto-creates a profile per signup; **first user becomes admin** |
| `app_settings` (singleton) + `public_settings` view | hCaptcha key, S3 config, `signup_requires_invite` flag |
| `invite_codes` + `consume_invite()` | Invite-gated signup flow |
| `categories`, `scripts` | The script catalogue |
| `workers`, `worker_tokens` | Registered VPS workers |
| `runs`, `run_logs` | Run queue + streamed log lines |
| Realtime publication | Pushes `runs`, `run_logs`, `workers` updates to the UI |
| Storage buckets | `avatars` (public), `script-files`, `run-artifacts` (private) |

If for some reason your first signup did not become admin, run:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'YOUR_EMAIL'
on conflict do nothing;
```

---

## 3. Register the worker in the web UI

1. Sign in to the Script Hub UI as an admin.
2. Go to **Admin → Workers → Register worker**.
3. Type a name (e.g. `vps-worker-1`) and click **Register**.
4. **Copy the `WORKER_ID` (UUID)** that's shown.

---

## 4. Deploy on the VPS

```bash
# Pull this repo onto the VPS (or just copy the worker/ directory).
git clone <your-repo-url> isotopiq && cd isotopiq/worker

# Configure
cp .env.example .env
nano .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID

# Build and start (compose builds the image directly on the server)
docker compose up -d --build

# Verify
docker compose logs -f worker
```

Successful startup looks like:

```
[isotopiq-worker] starting · id=… · poll=3000ms
```

The worker registers as **online** in **Admin → Workers** and updates
`last_seen_at` every 15 seconds.

### Updating the worker

```bash
git pull
docker compose up -d --build
```

### Stopping / removing

```bash
docker compose down
```

---

## 5. Required environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Your Supabase URL, e.g. `https://supabase.example.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Service role** JWT. The worker uses this to claim runs and write logs. Keep it on the VPS only. |
| `WORKER_ID` | yes | UUID copied from Admin → Workers after registering. |
| `POLL_INTERVAL_MS` | no | Default `3000`. How often to poll for queued runs. |
| `HEARTBEAT_INTERVAL_MS` | no | Default `15000`. How often to update `last_seen_at`. |

---

## 6. What the worker does, step by step

1. **Heartbeat** — every `HEARTBEAT_INTERVAL_MS` it sets the workers row to
   `status='online'` and updates `last_seen_at`.
2. **Claim** — selects the oldest `queued` run with no `worker_id`, then
   atomically updates it to `status='running'` while the row is still
   `queued` (so two workers never claim the same run).
3. **Execute** — writes the script `source` to a temp file and runs:
   * `python3 script.py` for `language='python'`
   * `Rscript script.R` for `language='r'`
   * `bash script.sh` for `language='bash'`
   The run id and JSON-stringified params are exposed to the script as
   environment variables `RUN_ID` and `RUN_PARAMS`.
4. **Stream** — every line from stdout / stderr is inserted into
   `run_logs` with `stream='stdout'` or `'stderr'`. Realtime pushes them to
   the live log view in the UI.
5. **Finalize** — on exit, the run row is updated with `status`, `exit_code`,
   `duration_ms`, `finished_at` and a 50-line `output.tail` summary.
6. **Timeout** — if the script runs longer than the script's `timeout_s`,
   the worker sends `SIGKILL` and marks the run failed.

---

## 7. Customising what scripts can do

The Dockerfile installs `python3`, `r-base`, and `bash` by default. To add
extra system packages (e.g. `pandas`, `tidyverse`, custom CLIs), edit
`worker/Dockerfile`'s `apt-get install` line and/or add `RUN pip install …`
/ `RUN R -e "install.packages('…')"` steps, then rebuild:

```bash
docker compose up -d --build
```

If you want scripts to share a persistent working directory between runs,
uncomment the `volumes:` block in `docker-compose.yml`.

---

## 8. Running multiple workers

Just register a second worker in the UI with a different name, copy the
new `WORKER_ID`, and start a second compose stack on another VPS (or in a
different folder on the same host with a different `container_name`). Runs
are claimed atomically, so they will load-balance automatically.

---

## 9. Security notes

* The service role key bypasses RLS — only put it on machines you control.
* The worker only needs **outbound** HTTPS to Supabase. Do not expose any
  port on the VPS.
* Scripts run as root inside the container by default. For untrusted code,
  add a non-root user in the Dockerfile and/or run with `--read-only`,
  `--cap-drop=ALL`, and resource limits in `docker-compose.yml`.

---

## 10. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Worker shows **offline** in UI | `SUPABASE_URL` wrong, service role key invalid, or container exited — check `docker compose logs worker`. |
| Runs stay **queued** forever | No worker is online, or its `WORKER_ID` doesn't match a row in `workers`. |
| `permission denied` writing to `runs` / `run_logs` | You used the anon key instead of the service role key. |
| Python / R packages missing | Install them in the Dockerfile and rebuild. |
