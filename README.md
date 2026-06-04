# Workbench

A personal, local-first PWA for makers — capture ideas, run projects through
customizable stages, journal the process, collect inspiration. Deployed at
`workbench.homectl.no`.

See [`docs/`](./docs) for the PRD, domain model, UI/UX, and visual identity.

## Status

**Phase 1 — walking skeleton.** The full pipeline is wired end-to-end (auth →
DB → API → installable offline PWA shell) with near-empty features. Subsequent
phases layer features on these rails (see the implementation plan).

What works today:

- pnpm monorepo, single Docker image (Express serves the built SPA + `/api/*`).
- Backend: Express 5 + Kysely + node-pg-migrate (migrations run at boot). The
  app-owned `users` identity table, with **just-in-time provisioning** mapping
  the auth `sub` → app `user.id`. `GET /api/me` returns the resolved app user.
- Auth seam with two providers (see **Auth** below).
- Frontend: React + Vite + PWA (installable, offline app shell, self-hosted
  fonts). Navigation skeleton (Inbox · ➕ · Projects), sign-in screen, sync dot,
  empty states — per `docs/ui-ux-design.md` and `docs/visual-identity.md`.

## Local development

Prereqs: Node 24, pnpm 10, Docker.

```bash
cp .env.example .env                 # required — the backend loads it in dev
docker compose up -d postgres        # local Postgres (and `minio` for Phase 3+)
pnpm install
pnpm dev                             # frontend :3000 (proxy → :8080), backend :8080
```

The backend dev script reads the root `.env` via Node's `--env-file-if-exists`,
so `DATABASE_URL` (and `AUTH_MODE` etc.) must live there. Without `.env` the
backend exits with a Zod error for the missing `DATABASE_URL`.

Open http://localhost:3000. With `AUTH_MODE=dev` / `VITE_DISABLE_AUTH=true`
(the defaults) there's no login step — every request resolves to a fixed local
user, and a `users` row is provisioned on the first `/api/me` call.

Run the whole stack as the production image does:

```bash
docker compose up --build app        # migrates at boot, serves SPA + API on :8080
```

### Tests

```bash
pnpm --filter @workbench/backend test    # Vitest + Testcontainers Postgres
pnpm --filter @workbench/frontend test:unit
```

## Auth

Authentication is delegated to **homectl-auth** (OAuth2 + RS256 JWT). The app
keeps its **own** identity: the JWT `sub` is stored once on the `users` row
(`auth_sub`); everything else is scoped by the app's own `user.id`.

Two providers, selected by `AUTH_MODE`:

- **`dev`** (default outside production) — no auth service needed. Requests
  resolve to a fixed dev principal so the whole pipeline runs offline. A
  per-identity override is available via the `x-dev-sub` header (used in tests).
- **`homectl`** (default in production) — the real OAuth2 flow via
  `@gagnatdev/homectl-auth-client`. That package is private (GitHub Packages)
  and **not yet installed** here; enable it with:

  ```bash
  cp .npmrc.example .npmrc          # set GITHUB_TOKEN with read:packages
  pnpm add --filter @workbench/backend @gagnatdev/homectl-auth-client
  ```

  Then set `AUTH_MODE=homectl` and `WORKBENCH_CLIENT_SECRET`. The provider is
  loaded dynamically, so the default build never depends on the package.

  > ⚠️ The auth client is unproven (travel-journal is mid-migration onto it).
  > Validate the full login → callback → token → refresh flow against the real
  > `auth.homectl.no` when enabling this path, and be ready to patch the client.

## Deploy

GitHub Actions: `ci.yaml` (test + build) → `deploy.yml` (build/push image to
`rg.fr-par.scw.cloud/homectl/workbench` → `kubectl apply` of `k8s/deployment.yml`).
One-time infra provisioning (Postgres DB, S3 bucket, auth app registration, DNS,
k8s secret `workbench-secrets`) is **Phase 0** and done outside this repo.
