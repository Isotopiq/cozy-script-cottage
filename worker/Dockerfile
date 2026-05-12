# Isotopiq Script Hub — VPS Worker
# Builds a Node 20 image with python3, R, and bash available so scripts
# of all three supported languages can be executed inside the container.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app

# Install language runtimes for executing user scripts.
# Add OS packages here if you want extra system tools available to scripts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        r-base \
        bash ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
