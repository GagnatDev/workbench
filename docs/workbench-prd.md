# Workbench — Product Requirements Document (V1)

> **Status:** Draft · **Date:** 2026-06-01 · **Author:** Ann-Katrin Gagnat
> **Supersedes/extends:** [`personal-creative-workbench.md`](./personal-creative-workbench.md) (original brainstorm)

This PRD captures the decisions made in a design session that turned the original brainstorm into a buildable V1. It records *what* we're building and *why*; the *how* (step-by-step build sequence) lives in the implementation plan.

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
| 6 | **Four distinct entity types** | Ideas, Projects, Journal entries, and Moodboard items are conceptually separate (see §6). |
| 7 | **Fits existing infrastructure** | Deploys to the `homectl` k8s cluster, reuses managed Postgres and S3-compatible object storage, follows the `unforked` app's conventions. |

---

## 6. Domain model

Four core entities, as the user envisions the workflow:

- **Idea** — captured fast, lands in the **Inbox**. Can be promoted to *initiate* a Project. Ideas can also be captured *inside* a project. (Text and/or photo, optional link.)
- **Project** — the workspace for committed work. Has a **status** drawn from a customizable stage list, flexible structured **details** (materials, dimensions, temperatures — varies by craft), a **to-do checklist**, a **moodboard**, and a stream of journal entries.
- **Journal entry / Event** — a timestamped record of what actually happened within a project (e.g. "May 12 — threw 3 cups, walls too thick").
- **Moodboard item** — an image or link collected as inspiration within a project.

**Cross-cutting:** **Tags** (free-form labels) and **Collections** (group projects by domain, e.g. ceramics vs. app ideas) apply across entities. Photos are first-class attachments on ideas, journal entries, and moodboard items.

---

## 7. Functional requirements (V1)

**Capture & Inbox**
- One-tap new-idea capture (text + photo) from anywhere; saved immediately, no required fields.
- All loose ideas collect in an **Inbox**.
- Inbox review: edit, tag, delete, archive, or **promote to a Project**.

**Projects**
- Create/edit/delete projects with title and description.
- **Customizable status pipeline** per project, seeded from a template; user can rename/reorder stages.
- **Flexible structured details** (key/value) for craft-specific data.
- **To-do checklist** per project.
- Assign a project to a **Collection**.

**Process journal**
- Add timestamped journal entries (text + photo) to a project.
- View a chronological project timeline.

**Moodboard**
- Attach images and links to a project's moodboard (no automatic preview in V1).

**Organisation**
- Tag ideas and projects; group projects into collections; mark favourites; basic filtering.

**Offline & PWA**
- App shell and data available offline; create/edit ideas, projects, journal entries, and capture photos with no connection.
- Sync (LWW) on reconnect. Installable PWA with a sync-status indicator.

**Accounts**
- Login via `homectl-auth`; users are provisioned by invite. Each user sees only their own data.

---

## 8. Architecture (overview)

- **Single deployable** at `workbench.homectl.no`: a pnpm monorepo built into one Docker image. An **Express 5** server serves the built **React + Vite** PWA as static files *and* hosts the API and the auth callback on the same origin.
- **Local-first:** the client uses **Dexie/IndexedDB** as the offline source of truth. A **last-write-wins sync engine** (`pull`/`push` with soft-delete tombstones) reconciles with the backend.
- **Backend:** Express 5 + **Kysely** (typed SQL) + **node-pg-migrate** (plain-SQL migrations run at boot). Data in the managed **Postgres** database `workbench`, every row scoped to the authenticated user. Flexible fields stored as **JSONB**.
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
