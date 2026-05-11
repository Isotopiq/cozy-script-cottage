## Root cause

The container is starting `wrangler dev` against the **source** `wrangler.jsonc`, whose `main` is `src/server.ts`. The runtime stage only contains the **built** output (`dist/`), so wrangler can't find `src/server.ts` and exits.

The build already produces a self-contained, ready-to-serve Worker at `dist/server/index.js` with its own generated `dist/server/wrangler.json` (it references `../client` for static assets and has the correct compatibility flags). That's the artifact wrangler should run — not the source config.

## Fix (single change to `Dockerfile`)

1. In the runtime stage, copy the whole `dist/` directory (both `dist/client` and `dist/server`).
2. **Do not** copy the root `wrangler.jsonc`.
3. Set `WORKDIR /app/dist/server` so wrangler picks up the generated `wrangler.json` automatically.
4. Run `npx wrangler@^4 dev --ip 0.0.0.0 --port 47823 --local --no-show-interactive-dev-session` from that directory.

Resulting Dockerfile (runtime stage only changes):

```dockerfile
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
RUN npm install --no-save wrangler@^4

WORKDIR /app/dist/server
EXPOSE 47823
CMD ["npx", "--yes", "wrangler@^4", "dev", \
     "--ip", "0.0.0.0", "--port", "47823", \
     "--local", "--no-show-interactive-dev-session"]
```

No changes needed to `docker-compose.yml`, `wrangler.jsonc`, or any application code. Verified locally: `bun run build` produces `dist/server/index.js` + `dist/server/wrangler.json` with `main: "index.js"` and `assets.directory: "../client"`, so running wrangler from `dist/server/` resolves everything correctly.

## Note on `wrangler dev`

`wrangler dev --local` is currently the only first-party way to serve a built TanStack Start Worker on a generic Docker host (there's no separate `wrangler serve`). It runs the Worker in workerd locally and is appropriate for self-hosting behind EasyPanel's proxy. Port `47823` is preserved.
