# Isotopiq Script Hub — Web app container for EasyPanel / any Docker host
# Builds the TanStack Start frontend and serves it via wrangler (Cloudflare
# Workers compatible runtime) on a single port.

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app

# Wrangler is bundled via @cloudflare/vite-plugin's deps; install runtime
# wrangler separately so the image can serve the built worker.
RUN bun add -d wrangler@^3

EXPOSE 47823
CMD ["bunx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "47823", "--local", "--no-show-interactive-dev-session"]
