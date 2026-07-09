# -----------------------------------------------------------------------------
# Stage 1: Build frontend + backend (single Node toolchain, pnpm workspaces)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable

# Install workspace deps from the single root lockfile. Every dependency is
# public now — the private @gagnatdev/homectl-auth-client was dropped when auth
# moved to the auth-proxy sidecar — so no registry auth is needed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile

# Build both workspaces: frontend -> frontend/dist, backend -> backend/dist
# (a single bundled server.js + copied SQL migrations).
COPY . .
RUN pnpm --filter @workbench/frontend run build \
 && pnpm --filter @workbench/backend run build

# -----------------------------------------------------------------------------
# Stage 2: Runtime (Node 24, no node_modules — everything is bundled)
# -----------------------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app

RUN adduser -D -g "" appuser
USER appuser

# Bundled server + plain-SQL migrations (dist/migrations) + built SPA (web/).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ./web

EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
ENTRYPOINT ["node", "dist/server.js"]
