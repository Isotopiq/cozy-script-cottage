## Problem

The worker container runs Node 20, but `@supabase/supabase-js` v2.45+ now requires either Node 22+ (native WebSocket) or an explicit `ws` transport. On Node 20 the RealtimeClient constructor throws immediately on `createClient()`, so the worker crash-loops before it can poll runs.

## Fix

Bump the worker's Docker base image from `node:20-bookworm-slim` to `node:22-bookworm-slim` in `worker/Dockerfile` (both the `build` and runtime stages). Node 22 ships native `WebSocket`, which satisfies realtime-js without any code change.

This matches what the web container already uses (`node:22-bookworm-slim`), so it's a known-good runtime for this project. No app code, SQL, or worker logic changes — purely a base-image bump, so existing functionality (run claiming, log streaming, metrics, script execution with python3/R/bash) is preserved. The apt packages (`python3`, `r-base`, `bash`) are all available on bookworm under Node 22 too.

## Steps

1. Edit `worker/Dockerfile`:
   - `FROM node:20-bookworm-slim AS build` → `FROM node:22-bookworm-slim AS build`
   - `FROM node:20-bookworm-slim` → `FROM node:22-bookworm-slim`
2. On the VPS, rebuild and restart:
   ```bash
   cd ~/isotopiq/worker
   docker compose up -d --build
   docker compose logs -f worker
   ```
   Expected: `[isotopiq-worker] starting · id=… · poll=3000ms · metrics=5000ms` and no more WebSocket error.

## Alternative (not recommended)

Stay on Node 20 and add the `ws` package + `realtime: { transport: ws }` option to `createClient()`. Rejected because it adds a dependency and code change for no benefit — Node 22 is already the project standard.
