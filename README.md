# Workbench

A personal, local-first PWA for makers — capture ideas, run projects through
customizable stages, journal the process, collect inspiration. Deployed at
`workbench.homectl.no`.

See [`docs/`](./docs) for the PRD, domain model, UI/UX, and visual identity.

## Status

**Phase 4 — projects.** Project CRUD, a customizable per-project stage pipeline,
the flexible `details` block, collections, and favourites — the Projects tab and
project overview now stand on the Phase 2/3 local-first rails. Sections (journal,
moodboard, checklist, materials) and the project inbox layer on next (see the
implementation plan).

What works today:

- pnpm monorepo, single Docker image (Express serves the built SPA + `/api/*`).
- Backend: Express 5 + Kysely + node-pg-migrate (migrations run at boot). The
  app-owned `users` identity table, with **just-in-time provisioning** mapping
  the auth `sub` → app `user.id`. `GET /api/me` returns the resolved app user.
- Auth seam with two providers (see **Auth** below).
- **Local-first sync (LWW).** Six syncable content tables (collections,
  projects, sections, items, ideas, attachments) sharing one envelope
  (`id`/`user_id`/`updated_at`/`deleted`). `GET /api/sync/pull` +
  `POST /api/sync/push`, scoped to the token's user; the server forces `user_id`
  and stamps `updated_at` so the pull cursor lives in one clock domain. The
  client mirrors every table in **Dexie/IndexedDB** (source of truth offline)
  and syncs push-then-pull on focus/reconnect/after each edit; the header sync
  dot reflects live status.
- **Quick capture & global Inbox.** ➕ opens a keyboard-up bottom sheet
  (dismiss-saves, empty discarded) backed by **one reusable composer**
  (consistency rule §11.1). The Inbox has New/Kept segments (New badge counts
  only new) + archived behind the overflow; cards swipe right to archive, left to
  promote, tap for the detail sheet (edit, tag-autocomplete, keep, archive,
  delete). **Promote** spins up a Project from a stage template (Ceramics /
  Textiles / Generic / App-dev, last-used remembered), reparents the idea, and
  navigates into it.
- **Photos via presigned S3.** Capture attaches a photo as a local blob; on
  sync the engine presigns a PUT (`POST /api/uploads/presign`), uploads the
  blob **browser→S3 directly**, then marks the attachment uploaded.
  `GET /api/files/:id` redirects to a short-lived, ownership-checked presigned
  GET. Uploads are resilient — a failed/unconfigured upload never blocks data
  sync; the photo stays queued (shown in the sync dot) and retries. Scaleway
  Object Storage in prod, MinIO locally.
- **Projects.** The Projects tab is a flat card list (latest-photo thumbnail,
  status badge, time-since-last-activity) with a collection-filter chip row and
  favourites pinned on top; the header ➕ creates a project via the same mini-sheet
  as promote. The project overview carries a tap-to-jump **status sheet** with an
  inline stage editor (rename/reorder/add/delete, current status reconciled), the
  free-text two-column **details** block whose template-seeded keys vanish until
  filled, collection assignment (create-on-the-spot), the favourite star, and
  edit/delete. Project + collection writes ride the same six-table LWW sync.
- Frontend: React + Vite + PWA (installable, offline app shell, self-hosted
  fonts). Navigation skeleton (Inbox · ➕ · Projects), sign-in screen, sync dot,
  empty states — per `docs/ui-ux-design.md` and `docs/visual-identity.md`.

## Local development

Prereqs: Node 24, pnpm 10, Docker.

```bash
cp .env.example .env                 # required — the backend loads it in dev
docker compose up -d postgres minio minio-init   # Postgres + S3 (MinIO + bucket)
pnpm install
pnpm dev                             # frontend :3000 (proxy → :8080), backend :8080
```

The backend dev script reads the root `.env` via Node's `--env-file-if-exists`,
so `DATABASE_URL` (and `AUTH_MODE` etc.) must live there. Without `.env` the
backend exits with a Zod error for the missing `DATABASE_URL`.

Open http://localhost:3000. With `AUTH_MODE=dev` / `VITE_DISABLE_AUTH=true`
(the defaults) there's no login step — every request resolves to a fixed local
user, and a `users` row is provisioned on the first `/api/me` call.

To exercise photo capture locally, uncomment the `S3_*` block in `.env` (it's
pre-filled to match the docker-compose MinIO). Without it, capture still works —
photos just stay queued (the sync dot shows the count) instead of uploading.

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
  `@gagnatdev/homectl-auth-client` (pinned to `0.2.0`). The package is private
  (GitHub Packages), so installing needs registry auth:

  ```bash
  cp .npmrc.example .npmrc          # set GITHUB_TOKEN with read:packages
  pnpm install
  ```

  Then set `AUTH_MODE=homectl` and `WORKBENCH_CLIENT_SECRET`.

  Server-to-server calls (token exchange, JWKS, invite forwarding) use
  `AUTH_INTERNAL_URL` when set — in k8s this is the in-cluster service address
  (`http://homectl-auth.homectl.svc.cluster.local`), so backend traffic rides
  service discovery instead of the public auth ingress. `AUTH_SERVICE_URL`
  stays the public URL: it is the JWT issuer and the target for everything the
  browser itself must reach (`/authorize`, `/refresh`, `/logout` — the refresh
  cookie lives on the auth service's origin, so those cannot be proxied).

## Deploy

GitHub Actions: `ci.yaml` (test + build) → `deploy.yml` (build/push image to
`rg.fr-par.scw.cloud/homectl/workbench` → `kubectl apply` of `k8s/deployment.yml`).
One-time infra provisioning (Postgres DB, S3 bucket, auth app registration, DNS,
k8s secret `workbench-secrets`) is **Phase 0** and done outside this repo.
