# Max Booster — self-hosted reference container.
#
# This is NOT what Replit's own Publish button uses (that reads .replit's
# [deployment] run/build commands and runs directly on the VM — see
# start.sh). This image exists so the same app can run on any Docker host
# (your own server, another cloud) without Replit's run-container specifics.
#
# Build (from the repo root):
#   docker build -f docker/Dockerfile -t maxbooster .
# Run:
#   docker run -p 5000:5000 --env-file .env maxbooster
#
# Required environment variables: see .env.example at the repo root. Never
# bake secrets into the image — pass them at `docker run` time (--env-file)
# or via your hosting platform's secret store.
#
# Not included by default: the legacy Python AI content sidecar and the
# MaxCore video diffusion gateway (both need a Python runtime). The app
# already has a graceful-degradation path for both — see
# docker/docker-entrypoint.sh for details and how to extend this image if
# you need them.

# ── Stage 1: compile the optional boosterstate sidecar (Rust) ──────────────
FROM rust:1-slim-bookworm AS rust-builder
WORKDIR /build
COPY boosterstate/Cargo.toml boosterstate/Cargo.lock ./boosterstate/
COPY boosterstate/src ./boosterstate/src
RUN cd boosterstate && cargo build --release && \
    cp target/release/boosterstate /tmp/boosterstate

# ── Stage 2: install deps + build the app ───────────────────────────────────
FROM node:22-bookworm-slim AS node-builder
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
RUN npm ci
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY script ./script
COPY public ./public
COPY tsconfig.json tsconfig.server.json tsconfig.client.json vite.config.ts tailwind.config.ts drizzle.config.ts components.json ./
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

# ── Stage 3: runtime image ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package.json ./package.json
COPY --from=rust-builder /tmp/boosterstate ./bin/boosterstate
COPY docker/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh ./bin/boosterstate

# Only the app port is meant to be reachable from outside the container.
# Every internal sidecar port stays loopback-only, same contract as Replit.
EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
