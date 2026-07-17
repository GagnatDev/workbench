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
- Auth via the homectl-auth-proxy **sidecar** — the app reads identity from
  injected `X-Homectl-*` headers and does no token handling of its own (see
  **Auth** below).
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

Open http://localhost:3000. With `AUTH_MODE=dev` (the default outside
production) there's no login step and no auth-proxy in front — the backend
synthesizes a fixed local user for every request, and a `users` row is
provisioned on the first `/api/me` call.

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

Authentication is delegated to **homectl-auth** (OAuth2 + RS256 JWT) via the
**homectl-auth-proxy sidecar**. In production the sidecar sits in front of the
app in the same pod (ingress → Service → sidecar:4180 → app:8080): it runs the
OAuth flow, owns `/auth/callback` and `/auth/logout`, refreshes tokens
in-cluster, and injects a verified identity — `X-Homectl-User` / `-Email` /
`-Role` (plus a `Bearer`) — on every proxied request. The app reads those
headers and does **no** token handling; the browser holds only the sidecar's
opaque `hs_session` cookie and makes plain same-origin `fetch` calls. The app
keeps its **own** identity: the JWT `sub` (from `X-Homectl-User`) is stored once
on the `users` row (`auth_sub`); everything else is scoped by the app's own
`user.id`.

Identity source is selected by `AUTH_MODE`:

- **`dev`** (default outside production) — no sidecar in front. The backend
  synthesizes a fixed dev principal so the whole pipeline runs offline. A
  per-identity override is available via the `x-dev-sub` header (used in tests);
  the `X-Homectl-*` headers are also honored if present.
- **`sidecar`** (default in production) — identity comes only from the
  `X-Homectl-*` headers the auth-proxy injects; a request without them is
  unauthenticated. The sidecar's Kubernetes wiring (image, env, secrets) lives
  in [`k8s/deployment.yml`](./k8s/deployment.yml); its `AUTH_CLIENT_SECRET` and
  `COOKIE_KEY` are Terraform-managed (the app has `auth = true` in
  homectl-infra).

The only server-to-server auth call the app still makes is **invite forwarding**
(`POST /api/invites`), which relays the sidecar-injected bearer to homectl-auth.
It uses `AUTH_INTERNAL_URL` when set — in k8s the in-cluster service address
(`http://homectl-auth.homectl.svc.cluster.local`), keeping that traffic off the
public auth ingress — while `AUTH_SERVICE_URL` (public) is used only to build the
human-clickable invite redemption link.

To run the real sidecar locally, run the `homectl-auth-proxy` container with
`DEV_FAKE_IDENTITY` in front of the app (see the sidecar integration guide §7).

## Deploy

GitHub Actions: `ci.yaml` (test + build) → `deploy.yml` (build/push image to
`rg.fr-par.scw.cloud/homectl/workbench` → `kubectl apply` of `k8s/deployment.yml`).
One-time infra provisioning (Postgres DB, S3 bucket, auth app registration, DNS,
k8s secret `workbench-secrets`) is **Phase 0** and done outside this repo.
