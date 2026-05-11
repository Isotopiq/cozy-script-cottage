# Isotopiq Script Hub — Web app container for EasyPanel / any Docker host
# Build the TanStack Start app with Bun, then run it with Node + wrangler 4.
# Wrangler does NOT support the Bun runtime, so the runtime stage must be Node.

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy only what wrangler needs to serve the built worker
COPY --from=build /app/dist ./dist
COPY --from=build /app/wrangler.jsonc ./wrangler.jsonc
COPY --from=build /app/package.json ./package.json

# Install wrangler 4 (compatible with the generated dist/server/wrangler.json)
RUN npm install --no-save wrangler@^4

EXPOSE 47823
CMD ["npx", "--yes", "wrangler@^4", "dev", \
     "--ip", "0.0.0.0", "--port", "47823", \
     "--local", "--no-show-interactive-dev-session"]
