# Workbench — UI/UX Design (V1)

> **Status:** Approved — ready for implementation · **Date:** 2026-06-03 · **Author:** Ann-Katrin Gagnat
> Companion to [`workbench-prd.md`](./workbench-prd.md) and [`domain-model.md`](./domain-model.md). This document is the canonical reference for screens, navigation, and user flows. It records the decisions from a UI/UX design session; rationale is given per decision.

Mobile-first throughout — the phone in the workshop is the primary device. Mockups below are phone-width; desktop adaptation is a single breakpoint (see [§10](#10-desktop-layout)).

---

## 1. Navigation skeleton

**Decision:** A three-zone bottom bar — **Inbox · ➕ · Projects** — with settings/profile behind a header avatar.

```
┌─────────────────────────┐
│ Workbench       ●  (👤) │   ← sync dot + avatar
│                         │
│      [screen body]      │
│                         │
├─────────────────────────┤
│  📥 Inbox   ➕   📁 Proj │
└─────────────────────────┘
```

- Only **two real destinations** to learn; the centered ➕ makes capture one tap from anywhere — the UI embodiment of "low friction above all."
- **Collections are not a tab.** They group projects *inside* the Projects tab (as filters, §5).
- **No Search tab** — full-text search is a V2 non-goal; an empty tab would be dead chrome.
- Settings, profile, and sign-out live behind the header avatar.

---

## 2. Quick capture

**Decision:** ➕ opens a **bottom sheet with the keyboard already up**. No Save button — **dismiss saves** (swipe down / tap outside); a completely empty capture is discarded.

```
┌─────────────────────────┐
│   (dimmed screen behind)│
├─────────────────────────┤
│ ─────                   │
│ [📥 Blue Cups ▾]        │   ← destination chip
│ ▍ Type an idea…         │
│                         │
│  📷 Photo    🔗 Link    │
├─────────────────────────┤
│      [ keyboard ]       │
└─────────────────────────┘
```

- The fastest possible loop: **tap ➕ → type → swipe away**. No required fields, no confirmation.
- 📷 and 🔗 are inline affordances; **tags are deliberately absent** — tagging happens at triage, not capture. Capture stays type-free (domain model: the Idea is the universal capture primitive).
- **Destination chip:** capture is context-aware — inside a project it defaults to that project's Inbox (`project_id` set), elsewhere to the global Inbox. The chip makes the destination *visible* and **tappable to retarget** (global, or pick another project). This avoids both failure modes: silently mis-filing an unrelated jot into the open project, and silently sending a project note to the global pile.

---

## 3. Global Inbox

### 3.1 Layout — segmented New / Kept

**Decision:** The Inbox has a two-segment control: **New** (unprocessed captures, `state = captured`) and **Kept** (`state = kept`). The tab badge counts **New only**.

```
┌─────────────────────────┐
│ Inbox              ⋯    │   ← ⋯ overflow: View archived
│ ┏━ New (2) ━┓│ Kept (5) │
│ ┌───────────────────┐   │
│ │ try ash glaze…    │   │
│ ├───────────────────┤   │
│ │ 🖼 kiln shelf pic │   │
│ └───────────────────┘   │
└─────────────────────────┘
```

- Inbox-zero applies to **New** — the satisfying empty state stays reachable. **Kept** is the browsable shelf of deliberately retained ideas, still promotable later.
- **Archived** ideas hide behind the overflow menu ("View archived") — recoverable but out of daily sight.

### 3.2 Triage interaction

**Decision:** Card list, newest first. **Swipe right = promote**, **swipe left = archive** (right = affirmative/advance, left = dismiss — matching card-stack, to-do, and mail conventions). Tap opens a detail sheet for the slower actions (edit, tag, keep, delete, move to an existing project's inbox).

- One gesture for each of the two common outcomes; full control one tap deeper.
- Swipe-to-triage is **inbox-only** — the gesture must never mean something different on another list (see §11 consistency rules).

### 3.3 Promote flow

**Decision:** Swiping to promote opens a **mini-sheet**: title prefilled from the idea's first line (editable), stage-template picker defaulting to the **last-used template**, no Collection asked (assign later). Confirm → creates the Project, reparents the Idea into its inbox (per the domain model), and **navigates into the new project**.

```
┌─────────────────────────┐
│ Promote to project      │
│ ▍ Try ash glaze…    ✎   │
│ Template: [Ceramics ▾]  │
│                         │
│        [ Create → ]     │
└─────────────────────────┘
```

- Fast enough to keep the swipe's momentum, but never creates an untitled mystery project or one with the wrong stage list (instant-create-with-undo was rejected for exactly those failure modes).

---

## 4. Project Inbox & filing

**Decision:** Tapping an idea in a project's inbox opens a **"File as…" sheet** with four big targets plus *Keep as note*. A section picker row appears **only when the project has more than one section of the chosen kind**.

```
┌─────────────────────────┐
│ "walls too thick on     │
│  cup 2, trim more" 🖼   │
│ ─── File as ─────────── │
│ [📖 Entry] [☑ Task]     │
│ [🖼 Pin]   [🧱 Material]│
│ ─────────────────────── │
│ ▸ Journal: (A) (B)      │  ← only if >1 of kind
│ [ Keep as note ]        │
└─────────────────────────┘
```

- Filing carries the idea's text and attachments into the new Item (domain model: *file* marks the Idea `filed`).
- A filed **journal entry pre-fills `entry_at` with the idea's capture time** — the jot in the workshop *was* the log; filing it days later shouldn't falsify the timeline.
- *Keep as note* moves the idea to the project inbox's **Kept** segment (same New/Kept split as the global Inbox, §3.1) — loose project notes have a visible, browsable home.

---

## 5. Projects tab

**Decision:** A **flat card list** with a horizontally scrollable **Collection filter chip row** (plus "All"), favourites pinned on top. Collections are filters, not folders — no drill-in hierarchy on mobile.

```
┌─────────────────────────┐
│ Projects           ⛭ ➕ │   ← ⛭ tag filter · ➕ new project
│ (All)(Ceramics)(Textil… │
│ ★───────────────────┐   │
│ │🖼 Blue Cups        │   │
│ │  [Glazing] · 2d ago│   │
│ ├───────────────────┤    │
│ │🖼 Raku test        │   │
│ │  [Drying] · 5h ago │   │
│ └───────────────────┘    │
└─────────────────────────┘
```

- Each card shows: title, **status badge**, thumbnail of the latest photo, and **time since last journal entry** (surfaces neglected work — craft happens across time gaps).
- With a handful of projects per user, folder hierarchy is mostly air; filtering keeps everything one tap away. (Status-grouped boards were rejected: stages are per-project custom lists, so there is no shared column set to group by.)
- The header ➕ creates a project directly via the same mini-sheet as promotion (§3.3) — title + template, nothing more.

---

## 6. Project screen

### 6.1 Structure — overview + section pages

**Decision:** A project opens to an **overview**: header (title, status chip, details block), an **inbox banner** when untriaged ideas exist, then **one preview card per Section** in rank order. Tapping a card opens that section **full-screen**, where the kind-specific UI lives.

```
┌─────────────────────────┐
│ ← Blue Cups   [Glazing▾]│
│ 📥 2 ideas to file  ›   │
│ Details              ✎  │
│  Clay body  stoneware   │
│  Height     12 cm       │
│ ┌ Journal ──────────› ┐ │
│ │ May 20 — glazed…    │ │
│ └─────────────────────┘ │
│ ┌ Checklist ─ 6/9 ──› ┐ │
│ │ ☐ order glaze       │ │
│ └─────────────────────┘ │
│ ┌ Moodboard ─ 🖼🖼🖼 ─› ┐│
│ └─────────────────────┘ │
│        ➕ Add section    │
└─────────────────────────┘
```

- The overview stays scannable however many sections exist; each kind gets a screen built for it (one long scroll was rejected — a project with two journals and 40 photos becomes endless; tab strips were rejected — multiple sections of one kind overflow them).
- Section cards show a 2–3 item preview (checklist shows done-count; moodboard shows a thumbnail strip).
- Sections are added (named, kind chosen), renamed, and deleted from the overview; reordered by long-press drag (§8).

### 6.2 Status

**Decision:** Tapping the status chip opens a **bottom sheet listing the project's stages in order**, current highlighted — **tap any stage to jump** (no forced linear progression; real work skips and regresses). An "Edit stages…" link at the bottom opens the rare-path editor (rename, reorder, add, delete).

```
┌─────────────────────────┐
│ Set status              │
│   ○ Planning            │
│   ○ In Progress         │
│   ○ Drying              │
│   ● Glazing      ✓      │
│   ○ Second Firing       │
│   ○ Complete            │
│ ─────────────────────── │
│   ✎ Edit stages…        │
└─────────────────────────┘
```

- The frequent action (set status) is two taps; the rare action (customize stages) is tucked away but discoverable exactly where you'd look for it.

### 6.3 Details

**Decision:** The flexible `details` JSONB renders as a compact **two-column key–value block** under the description. Edit mode is a list of label/value text-pairs with an "Add detail" row. **Both sides are free text** — no types, no unit enforcement; "12 cm" is just a string.

- Templates may **seed suggested empty keys** (Ceramics → *Clay body*, *Firing temp*, *Shrinkage*) that vanish if left blank — gentle structure without a form-builder.
- Typed per-craft field schemas were explicitly rejected: that is exactly the rigidity the design principles reject ("flexible structure", "no complex forms").

---

## 7. Section screens

### 7.1 Journal

**Decision:** **Reverse-chronological feed** (newest on top — reopening a project, you want the latest state), grouped by date, photos as a tappable thumbnail strip per entry. A **persistent composer bar** pinned at the bottom: text field, 📷 camera button, and a 🕒 control to **backdate `entry_at`** ("logging yesterday's kiln opening"); defaults to now.

```
┌─────────────────────────┐
│ ← Journal · Blue Cups   │
│ ─ May 20 ────────────── │
│ Glazed blue matte, too  │
│ thick at rim 🖼🖼        │
│ ─ May 15 ────────────── │
│ Trimmed foot 🖼          │
├─────────────────────────┤
│ 📷 │ Add an entry…   🕒 │
└─────────────────────────┘
```

- The composer uses the **same grammar as the capture sheet** (§2): type → dismiss = saved. Adding a line of text must cost nothing.

### 7.2 Moodboard

**Decision:** **Two-column masonry grid.** Image pins render at natural aspect ratio (cropping references to squares defeats the point — you saved that vase for its proportions) with optional caption. Link pins render as **compact text cards** — domain name + your caption — honest about V1's lack of scraped previews instead of broken-image placeholders.

```
┌─────────────────────────┐
│ ← Moodboard · Blue Cups │
│ ┌────────┐ ┌────────┐   │
│ │   🖼   │ │  🖼    │   │
│ │        │ │        │   │
│ └────────┘ └────────┘   │
│ ┌────────┐ ┌────────┐   │
│ │🔗 youtu…│ │   🖼   │  │
│ │glaze vid│ │        │  │
│ └────────┘ └────────┘   │
│        [ ➕ ]            │
└─────────────────────────┘
```

- Tap image → full-screen viewer (pinch-zoom, swipe between pins). Tap link → opens in browser.
- ➕ tile offers: camera / photo library / paste URL.

### 7.3 Checklist & Materials

Conventional lists — no novel interaction:

- **Checklist:** tap the checkbox to toggle `done`; tap the row to edit; a bottom "Add a task…" field matching the journal composer's grammar. Done items stay in place (struck through) rather than auto-sinking — order is user-controlled.
- **Materials:** rows show *title · quantity unit*, with notes (`body`) as a second line and an optional photo thumbnail. Same bottom add-field.

---

## 8. Reordering

**Decision:** **Long-press to drag**, everywhere something is ordered — items within a section, sections within a project, projects within the list. Haptic tick on lift, drop to place.

- No persistent grab handles cluttering rows, no separate edit mode; drag only starts after the long-press delay, so it never fights scrolling. The now-standard mobile pattern.
- Drops compute **fractional/lexicographic ranks** (domain model §cross-cutting) — insert-between, no renumbering, safe under offline LWW sync.

---

## 9. Cross-cutting

### 9.1 Sync status

**Decision:** A **quiet status dot** in the header beside the avatar: 🟢 synced · ⟳ syncing · ⊕ grey offline-with-pending · 🔴 error. Tap it for a panel: pending counts ("3 changes · 2 photos queued") and a manual **Sync now**. Photo thumbnails not yet uploaded carry a small ⤴ badge.

```
   tap ● →  ┌───────────────┐
            │ ⊕ Offline      │
            │ 3 changes,     │
            │ 2 photos queued│
            │ [Sync now]     │
            └───────────────┘
```

- Calm by default, inspectable when you care. A persistent offline banner was rejected — the workshop *is* the offline place; a banner during normal use becomes noise. Fully invisible sync was rejected — with photos bound for S3, the user needs to answer "is my data on the server yet?"

### 9.2 Tags

**Decision:** Tags are entered as **chips with autocomplete** (from the user's existing tags) on idea, project, and item detail screens. Filtering is **local to each list**: a filter icon on Inbox, Projects, and section screens reveals a tag-chip filter row.

```
┌─────────────────────────┐
│ Projects            ⛭   │
│ (All)(Ceramics)…        │
│ #raku ×  #blue ×        │   ← active filters
│ ┌───────────────────┐   │
│ │ Raku test [Drying]│   │
│ └───────────────────┘   │
└─────────────────────────┘
```

- **No global cross-entity tag browser in V1.** "Tap #raku, see everything raku everywhere" is effectively search — a cross-entity query with a mixed-type result list — which is deliberately V2. Tagging items *now* (cheap) preserves the knowledge-base payoff for *later*.

### 9.3 Login & first run

**Decision:** One minimal **Sign in** screen → OAuth redirect to `auth.homectl.no` → back into the app. **No onboarding wizard, no demo data** — each empty screen teaches itself:

- Inbox (New): *"Tap ➕ to capture your first idea."*
- Projects: *"Ideas become projects — capture one first, then promote it."*
- Project overview, no sections: *"Add a journal to start logging."*

```
┌─────────────────────────┐
│                         │
│      🔨 Workbench       │
│                         │
│  [ Sign in with        │
│     homectl ]           │
│                         │
│  Invite-only · ask Ann  │
└─────────────────────────┘
```

- **Offline token expiry never locks the local app.** Local-first means read/write continues regardless; re-auth is demanded only when sync needs the network anyway (a gentle prompt in the sync panel, not a wall). Being locked out of your own offline notes in the workshop would betray the app's core promise.

---

## 10. Desktop layout

**Decision:** One layout adaptation at **~768px**: the bottom tab bar becomes a **slim left rail** (Inbox / ➕ / Projects / avatar), content renders in a **centered max-width (~680px) column**, and bottom sheets become centered modals. Same component tree, one breakpoint.

```
┌──────────────────────────────┐
││📥│    ┌─────────────┐       │
││➕│    │  Projects   │       │
││📁│    │  ▣ Blue…    │       │
││  │    │  ▣ Raku…    │       │
││👤│    └─────────────┘       │
│rail    centered column       │
└──────────────────────────────┘
```

- No two-pane list+detail views in V1 — they fork navigation logic (selection state vs. routes) for an app whose soul is the workshop phone. Cheap to build, and never feels like a stretched phone on the app-developers' monitors.

---

## 11. Consistency rules

Two rules that hold the system together; treat violations as bugs:

1. **One composer grammar.** The capture sheet (§2), journal composer (§7.1), checklist/materials add-fields (§7.3), and promote mini-sheet (§3.3) share one interaction pattern — *type → dismiss/confirm = saved, empty = discarded*. Build it as **one reusable component**, not four lookalikes.
2. **Swipe means triage, only in inboxes.** Swipe-to-archive/promote exists on inbox idea cards and nowhere else. No swipe actions on tasks, journal entries, pins, or project cards — a gesture that means different things on different lists erodes trust in all of them.

---

## 12. Screen inventory

| # | Screen | Route (suggested) | Reached from |
|---|--------|-------------------|--------------|
| 1 | Sign in | `/login` | unauthenticated |
| 2 | Global Inbox (New/Kept) | `/inbox` | tab |
| 3 | Archived ideas | `/inbox/archived` | inbox overflow |
| 4 | Idea detail sheet | (sheet) | tap idea |
| 5 | Capture sheet | (sheet, global) | ➕ |
| 6 | Promote mini-sheet | (sheet) | swipe-promote / Projects ➕ |
| 7 | Projects list | `/projects` | tab |
| 8 | Project overview | `/projects/:id` | project card |
| 9 | Project inbox (New/Kept) | `/projects/:id/inbox` | inbox banner |
| 10 | File-as sheet | (sheet) | tap project idea |
| 11 | Stage sheet / stage editor | (sheet) | status chip |
| 12 | Details editor | (inline edit) | ✎ on overview |
| 13 | Journal section | `/projects/:id/sections/:sid` | section card |
| 14 | Moodboard section | 〃 | 〃 |
| 15 | Checklist section | 〃 | 〃 |
| 16 | Materials section | 〃 | 〃 |
| 17 | Photo viewer | (overlay) | any thumbnail |
| 18 | Sync panel | (popover) | header dot |
| 19 | Settings / profile | `/settings` | header avatar |

Sheets and overlays are not routes of their own except where deep-linking matters (sections are routable so the PWA can restore where you were).
