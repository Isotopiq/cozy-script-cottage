# Isotopiq Script Hub — Web app container for EasyPanel / any Docker host
# Build the TanStack Start app with Bun, then run the *built* Worker with
# Node + wrangler 4. Wrangler does NOT support the Bun runtime.

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy ONLY the built output. The build generates dist/server/wrangler.json
# with main=index.js and assets pointing at ../client — that's what we run.
# Do NOT copy the source wrangler.jsonc (it points at src/server.ts which
# does not exist in the runtime image).
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

RUN npm install --no-save wrangler@^4

WORKDIR /app/dist/server
EXPOSE 47823
CMD ["npx", "--yes", "wrangler@^4", "dev", \
     "--ip", "0.0.0.0", "--port", "47823", \
     "--local", "--no-show-interactive-dev-session"]
