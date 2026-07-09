# Workbench — Product Requirements Document (V1)

> **Status:** Approved — ready for implementation · **Date:** 2026-06-01 · **Approved:** 2026-06-03 · **Author:** Ann-Katrin Gagnat
> **Supersedes/extends:** [`personal-creative-workbench.md`](./personal-creative-workbench.md) (original brainstorm)
> **Companion docs:** [`domain-model.md`](./domain-model.md) (entities & flows · §6) · [`ui-ux-design.md`](./ui-ux-design.md) (screens & navigation) · [`visual-identity.md`](./visual-identity.md) (palette & type)

This PRD captures the decisions made in a design session that turned the original brainstorm into a buildable V1. It records *what* we're building and *why*; the *how* (step-by-step build sequence) lives in the implementation plan. The detailed domain model, UI/UX, and visual identity each have their own companion document (linked above).

---

## 1. Summary

**Workbench** is a personal, local-first PWA for makers and creative practitioners to capture ideas, run projects through customizable stages, journal the process, collect inspiration, and build a searchable body of personal knowledge. It is deployed at **`workbench.homectl.no`** into the existing `homectl` Scaleway/Kubernetes infrastructure, authenticated through the existing `homectl-auth` invite system, and intended for the author plus a few invited friends — each with their own **private** workbench.

---

## 2. Problem

Existing tools (Notion, Trello, Pinterest, Apple Notes) each cover only part of a maker's workflow. A craftsperson needs one place to: capture fleeting ideas with near-zero friction, collect web inspiration, plan and track project execution, document the physical process over time, remember technical details (materials, temperatures, measurements), and build searchable personal experience. No single tool does all of this well, and crucially none is built for the realities of workshop use — dirty hands, poor connectivity, and long time-gaps between sessions.

---

## 3. Goals & non-goals

**Goals (V1)**
- Near-zero-friction capture of ideas (text + photo) into an Inbox.
- Turn ideas into projects with **customizable stages** that suit any craft.
- A chronological, photo-rich process journal per project.
- Per-project moodboard for inspiration (images + links).
- Tags and collections for organisation.
- **Fully usable offline**; syncs when back online. Installable as a PWA.
- Multi-user with **private-per-person** data, via the existing invite system.

**Non-goals (V1)**
- Collaboration, shared workspaces, or shared projects.
- Reminders / push notifications.
- Automatic link previews/thumbnails and OS "share-to-app" targets.
- Voice-to-text, full-text search, a dedicated materials/glaze database, calendar view.
- Any AI features.

---

## 4. Target users

Anyone doing **process-based creative or physical work** — ceramicists, textile artists (knitting/sewing/weaving), woodworkers, and (for this cohort) app developers — who wants a single place to capture, plan, document, and learn from their practice. The initial users are the author and a few friends, whose crafts span **ceramics, textiles, mixed/varied crafts, and app development** — which is why stages and structured fields must be configurable rather than craft-specific.

---

## 5. Key product decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Multi-user, accounts required** | Author + a few friends; uses the existing `homectl-auth` invite system rather than a new auth system. |
| 2 | **Private per person** | Each account is an isolated workbench; no collaboration in V1. Dramatically simpler — no permissions, no shared-edit conflicts. |
| 3 | **Local-first with simple sync** | Workshop use demands offline writing. Single-writer-per-account means **last-write-wins (LWW)** is sufficient; no CRDTs/OT needed. |
| 4 | **PWA from day one** | Installable, offline-capable, camera access, one codebase across devices. |
| 5 | **Configurable stages, not hardcoded ceramics** | Users span multiple crafts. Stages are per-project, seeded from templates (Ceramics / Textiles / Generic / App-dev). Structured detail is flexible, not schema-bound. |
| 6 | **One container shape, not bespoke types** | Journal, moodboard, checklist, and materials are the same shape — *a named container of small records* — so they unify into one **Section** + **Item** model discriminated by `kind` (see §6). Ideas stay a separate capture primitive with their own lifecycle. |
| 7 | **Fits existing infrastructure** | Deploys to the `homectl` k8s cluster, reuses managed Postgres and S3-compatible object storage, follows the `unforked` app's conventions. |

---

## 6. Domain model

The model is built from a small set of entities. The key insight: **journal, moodboard, checklist, and materials are all the same shape — a named container of small records** — so they unify into one **Section** concept rather than four bespoke types.

**Entities**

- **User** — the app's **own identity record**. Has its own `id uuid` (the value used as `user_id` on every other row) and stores the homectl-auth `sub` in an `auth_sub` column, plus cached `email` / `display_name` / `app_role`. Workbench owns its users rather than depending on the auth provider's identifier everywhere; a User row is **provisioned the first time an invited person authenticates** (see §8). This means the auth service can be swapped or re-keyed without rewriting `user_id` across the data.
- **Collection** — groups Projects by domain (ceramics, textiles, app ideas). A Project belongs to zero or one Collection.
- **Idea** — the **universal capture primitive**: a fast, low-friction capture (text and/or photo, optional link). An Idea is either **global** (no `project_id` → the user-level **Inbox**) or **project-scoped** (`project_id` set → that project's **Inbox**). You never choose a type at capture time. An Idea is later *processed*: a global Idea is **promoted to a Project**; a project Idea is **filed into a Section** (becoming a journal entry, task, pin, or material) or kept as a loose project note. Ideas keep a distinct lifecycle (captured → kept/archived → promoted/filed) and intentionally live *outside* the Section/Item world.
- **Project** — the workspace for committed work. Has a title, description, a **status** drawn from a customizable per-project stage list, a flexible **`details`** JSONB blob for one-off structured specs (target dimensions, intended form, expected shrinkage), and a **`favourite`** flag (favourites pin to the top of the Projects list). A Project holds many **Sections** and may belong to a Collection.
- **Section** — a named container inside a Project, discriminated by **`kind`**: `journal`, `moodboard`, `checklist`, `materials` (extensible). A Project can have **multiple named Sections of any kind** (e.g. two journals "Variant A" / "Variant B", several moodboards). The Section's `kind` determines how its Items are rendered and validated.
- **Item** — the atomic record living inside a Section. Shared columns (title/body, ordering rank, tags, timestamps) plus a **`payload`** JSONB carrying kind-specific fields:
  - in a `journal` → a timestamped **entry** (`entry_at`, body)
  - in a `checklist` → a **task** (`done`)
  - in a `moodboard` → a **pin** (`image` or `link` subtype: `storage_key` / `url`, caption)
  - in a `materials` → a **material** (`quantity`, `unit`; notes in `body`)
- **Attachment** — a photo, with a **polymorphic owner** (an Idea or an Item). Stored in object storage; referenced by `storage_key`.

**Shape**

```
Collection
  └─ Project ── details (JSONB: one-off specs)
       └─ Section (kind: journal | moodboard | checklist | materials; named; 0..N of each)
            └─ Item (shared fields + kind-specific payload)
                 └─ Attachment (photo)

Idea (capture primitive — lives in the global Inbox OR a project-scoped Inbox)
  ├─ global         ──promote (reparent)──▶ new Project (idea moves into its Inbox)
  ├─ project-scoped ──file──▶ Section Item (entry | task | pin | material)
  └─ Attachment (photo)
```

**Cross-cutting**
- **Tags** — free-form labels on Ideas, Projects, and Items.
- **Ordering** — Sections within a Project and Items within a Section are explicitly ordered. Because the app is offline-first with last-write-wins sync, ordering uses **fractional/lexicographic ranks** (insert-between without renumbering) so concurrent offline reorders don't collide or trigger renumber storms.

**Design rationale & guardrails**
- Every content row carries `user_id` → `users.id` (the app's own identity), **not** the auth `sub`. The `sub` lives once, on the `users` row. `users` itself is **server-side identity** and is *not* a synced content table — the client fetches its own profile via `/api/me`.
- Unifying into Sections + Items collapses the **synced content** tables to six (`collection`, `project`, `section`, `item`, `idea`, `attachment`), which the local-first LWW sync engine strongly favors over a dozen bespoke tables.
- The cost of this generality is that **per-`kind` integrity is enforced in application code, not the database**. Each kind has a **Zod schema** validating its Item `payload` on write (a discriminated union keyed on `section.kind` / item subtype), keeping the `payload` from degenerating into an unvalidated junk drawer.
- Adding a new Section `kind` is free at the schema level but still requires its own UI rendering, capture affordance, and validation — schema generality is **not** feature-completeness.

**Capture & promotion flows (resolved)**
- **In-project capture** — a jot made *inside* a Project creates a **project-scoped Idea** (`project_id` set) in that project's Inbox. It is triaged later: **filed** into a Section (journal entry / task / pin / material) or kept as a loose project note. Capture stays type-free; structure is added on triage.
- **Promotion** — promoting a global Idea **creates a new Project and reparents the Idea into that project's Inbox** (carrying its text and attachments), where it is then expanded or filed. Promotion is simply "create Project + set the Idea's `project_id`," reusing the same processing model rather than a bespoke conversion.

---

## 7. Functional requirements (V1)

**Capture & Inbox**
- One-tap new-idea capture (text + photo) from anywhere; saved immediately, no required fields.
- Ideas collect in an **Inbox** — the global Inbox (captured outside any project) or a **per-project Inbox** (captured inside a project).
- Process the global Inbox: edit, tag, delete, archive, or **promote an idea to a new Project** (reparents it into that project's Inbox).
- Process a project Inbox: **file an idea into a Section** (journal entry / task / pin / material) or keep it as a project note.

**Projects**
- Create/edit/delete projects with title and description.
- **Customizable status pipeline** per project, seeded from a template; user can rename/reorder stages.
- **Flexible details** (key/value JSONB) for one-off structured specs (dimensions, intended form, shrinkage).
- Add, name, reorder, and delete **Sections** (kinds: `journal`, `moodboard`, `checklist`, `materials`), with **multiple of any kind** per project.
- Assign a project to a **Collection**.

**Sections & Items**
- **Journal** — add timestamped entries (text + photo); view a chronological timeline; multiple journals per project (e.g. per variant).
- **Checklist** — add tasks with a done state; reorder.
- **Moodboard** — pin images and links (no automatic preview in V1).
- **Materials** — list materials with quantity, notes, and an optional photo.
- Items are reorderable within a Section; Sections are reorderable within a Project.

**Organisation**
- Tag ideas and projects; group projects into collections; mark favourites; basic filtering.

**Offline & PWA**
- App shell and data available offline; create/edit ideas, projects, journal entries, and capture photos with no connection.
- Sync (LWW) on reconnect. Installable PWA with a sync-status indicator.

**Accounts**
- Login via `homectl-auth`; access is granted by invite. On a person's first authenticated request, Workbench **provisions a local `users` row** (mapping the verified `auth_sub` to its own `user.id`). Each user sees only their own data, scoped by that `user.id`.

---

## 8. Architecture (overview)

- **Single deployable** at `workbench.homectl.no`: a pnpm monorepo built into one Docker image. An **Express 5** server serves the built **React + Vite** PWA as static files *and* hosts the API and the auth callback on the same origin.
- **Local-first:** the client uses **Dexie/IndexedDB** as the offline source of truth. A **last-write-wins sync engine** (`pull`/`push` with soft-delete tombstones) reconciles with the backend.
- **Backend:** Express 5 + **Kysely** (typed SQL) + **node-pg-migrate** (plain-SQL migrations run at boot). Data in the managed **Postgres** database `workbench`, every content row scoped by `user_id` (→ `users.id`). Flexible fields stored as **JSONB**.
- **Identity:** the app keeps its own **`users`** table; a `resolveUser` step after auth maps the verified JWT `sub` to a local `user.id` (creating the row just-in-time on first login), so Workbench owns its identity and isn't coupled to the auth provider's key beyond the initial mapping.
- **Photos:** stored in **S3-compatible object storage** (bucket `homectl-workbench`) via **presigned PUT/GET** URLs; captured offline as local blobs, uploaded on sync.
- **Auth:** `@gagnatdev/homectl-auth-client` against `auth.homectl.no` (OAuth2 code flow + RS256 JWT bearer). The app is registered in `homectl-auth`'s `apps.json` with roles `member`/`admin`.
- **Deploy:** GitHub Actions (CI → build & push image to `rg.fr-par.scw.cloud/homectl/workbench` → `kubectl apply`), mirroring the `unforked` app. NGINX ingress + cert-manager TLS.

> **Risk — auth client maturity:** `@gagnatdev/homectl-auth-client` is **not yet in production**; the `travel-journal` app is mid-migration onto it. The library may contain bugs we'll need to find and fix during implementation. Validate the full login/callback/refresh flow early and coordinate fixes with the travel-journal migration.

---

## 9. Release roadmap

- **V1 (this PRD):** capture/inbox, projects with customizable stages, journal, moodboard, tags/collections, offline PWA, accounts. Built **walking-skeleton-first** (prove the full auth + DB + storage + deploy pipeline before features).
- **V2 — Depth:** share-to-app from the browser, smart link previews/thumbnails, a materials/glaze database, full-text search, calendar view.
- **V3 — Intelligence:** AI assistance (summaries, suggested to-dos, technique recommendations), auto-structuring pasted text, visual similarity search, collaboration/sharing.

---

## 10. Design principles

1. **Low friction above all** — write something → saved. No required fields, no complex forms.
2. **Flexible structure** — an idea can be one line; a project can hold dozens of logs, images, and details. Both are first-class.
3. **Prose and structure together** — free-form notes *and* structured data (dimensions, temperatures, checklists).
4. **Built for physical work** — designed around dirty hands, poor connectivity, and gaps between sessions.

---

## 11. Open questions & risks

- **Auth client bugs** (see §8 risk) — highest near-term implementation risk.
- **LWW edge cases** — acceptable for single-user-per-account, but two-device simultaneous edits silently lose the older write; revisit if it bites.
- **Private bucket access** — confirm presigned-GET latency/UX for displaying many thumbnails; consider caching strategy.
- **Reminders** — deferred, but the workshop use case ("remove from kiln Friday") is strong; plan a dedicated milestone given PWA push complexity (especially iOS).
