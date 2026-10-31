# -----------------------------------------------------------------------------
# Stage 1: Build frontend + backend (single Node toolchain, pnpm workspaces)
# -----------------------------------------------------------------------------
FROM node:24.22.2-alpine AS build
WORKDIR /app

# pnpm 12 is a native binary. Node 24.22.2 bundles Corepack 0.36.0, which
# downloads the musl build on alpine. Disable the download prompt so a
# non-interactive build cannot hang if Corepack's TTY detection changes.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Install workspace deps from the single root lockfile.
# The github_token secret provides read:packages access for @gagnatdev/* without
# leaking the token into any image layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN --mount=type=secret,id=github_token \
    ( \
        echo "@gagnatdev:registry=https://npm.pkg.github.com" && \
        echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/github_token)" \
    ) > .npmrc \
    && pnpm install --frozen-lockfile \
    && rm .npmrc

# Build both workspaces: frontend -> frontend/dist, backend -> backend/dist
# (a single bundled server.js + copied SQL migrations).
COPY . .
RUN pnpm --filter @workbench/frontend run build \
 && pnpm --filter @workbench/backend run build

# -----------------------------------------------------------------------------
# Stage 2: Runtime (Node 24.22.2, no node_modules — everything is bundled)
# -----------------------------------------------------------------------------
FROM node:24.22.2-alpine
WORKDIR /app

RUN adduser -D -g "" appuser
USER appuser

# Bundled server + plain-SQL migrations (dist/migrations) + built SPA (web/).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ./web

EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
ENTRYPOINT ["node", "dist/server.js"]
