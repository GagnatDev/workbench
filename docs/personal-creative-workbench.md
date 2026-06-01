# Personal Creative Workbench — App Concept

> A specialised tool for makers, craftspeople, and creative practitioners to capture ideas, manage projects, document processes, and build personal knowledge — all in one place.

-----

## The Problem

Existing tools like Notion, Trello, Pinterest, and Apple Notes each cover only part of a maker’s workflow. A ceramicist (or any craftsperson) needs a system that handles:

- Capturing ideas quickly, in any form
- Collecting inspiration from the web
- Planning and tracking project execution
- Documenting the physical process over time
- Remembering technical details (materials, temperatures, measurements)
- Building searchable personal experience and knowledge

No single tool does all of this well.

-----

## The Vision

A **personal creative workbench** — not just another notes app, but a purpose-built environment for creative, process-based work. It combines:

|Layer                |Description                                                   |
|---------------------|--------------------------------------------------------------|
|**Idea bank**        |Rapid capture of fleeting ideas                               |
|**Project manager**  |Status tracking through craft-specific stages                 |
|**Process journal**  |Chronological log of what happened and when                   |
|**Inspiration board**|Links, images, and references per project                     |
|**Knowledge archive**|Searchable personal database of recipes, failures, and lessons|

-----

## Core Features

### 1. Quick Capture (“Inbox”)

The most critical feature. Friction must be near zero.

- One-tap “New Idea” button from anywhere in the app
- Text, voice-to-text, photo, screenshot, or pasted link
- Share to app directly from browser or other apps
- All unprocessed ideas land in an **Inbox** for later review
- Auto-metadata: timestamp, source, suggested tags, category

-----

### 2. Inspiration Collection

- Save links (Pinterest, YouTube, blogs, Instagram, product pages)
- Automatic link preview: title, thumbnail, source name
- Clip text excerpts, recipes, measurements, and tables
- Per-project **moodboard**: reference images, color palettes, visual goals

-----

### 3. Project Structure

When an idea becomes a commitment, it becomes a **project**.

**Example project statuses for ceramics:**

1. Idea
1. Planning
1. In Progress
1. Drying
1. First Firing
1. Glazing
1. Second Firing
1. Complete
1. Failed / Lesson Learned

**Each project can contain:**

- Description (what, why, intended form)
- Materials (clay body, glaze, tools, firing temperature)
- Target dimensions (height, width, wall thickness, expected shrinkage)
- Linked inspiration
- A to-do checklist
- A process log (see below)

-----

### 4. Process Journal (Workshop Log)

A chronological, per-project log of what actually happened.

**Example entries:**

> **May 12** — Started throwing. Made 3 cups. Walls ended up too thick.
> 
> **May 15** — Trimmed foot. Photographed.
> 
> **May 20** — Glazed with blue matte. Applied too thickly at the rim.

**Photo documentation:**

- Capture directly in the app
- Before/after comparison view
- Annotate images with notes
- Visual timeline of a project’s progression

**Variants and experiments:**

- Track Variant A vs. Variant B
- Compare different glazes or firing temperatures
- Record outcomes per variant

-----

### 5. Reminders and Time Management

Craft work happens across days and weeks. Time-aware features matter.

**Manual reminders:**

- “Turn the piece tomorrow”
- “Check drying at 6pm”
- “Remove from kiln Friday”
- “Order new glaze”

**Smart suggestions (later versions):**

- When status changes to *Drying* → suggest a reminder in 24 hours
- When a glaze is recorded → prompt for firing temperature

-----

### 6. Personal Knowledge Base

Over time, the app becomes a searchable record of everything you’ve learned.

**Glaze / recipe log:**

```
Glaze: Blue Matte
Temperature: 1240°C
Result: Too dark, ran slightly, good texture
```

**Failure log:** “What went wrong and why” — structured learning from mistakes.

**Searchable by:** material, technique, outcome, tag, date, or keyword.

-----

### 7. Organisation

- **Tags**: `cup`, `vase`, `raku`, `blue`, `throwing`, `handbuilding`, `gift`, `test`
- **Collections / folders**: group projects by domain (ceramics, woodworking, app ideas)
- **Favourites**: mark ideas you want to act on soon
- **Search**: full-text across all notes, logs, and metadata

-----

### 8. Mobile-First & Offline (PWA)

Designed for use in the workshop, not just at a desk.

- Full offline support: read projects, write notes, take photos without connectivity
- Sync when back online
- Camera integration: document work, scan handwritten sketches, photograph glaze labels
- “Share to app” from browser — saves link or image directly to the inbox

-----

## Release Roadmap

### V1 — MVP

The minimum that makes the app genuinely useful:

- [ ] Create and manage ideas and projects
- [ ] Text notes and photo attachments
- [ ] Project status tracking
- [ ] Per-project to-do lists
- [ ] Tags and collections
- [ ] Link saving
- [ ] Process journal / timeline
- [ ] Reminders
- [ ] Offline support (PWA)

-----

### V2 — Depth

- [ ] Share to app from browser
- [ ] Smart link previews and thumbnails
- [ ] Materials and glaze database
- [ ] Full-text search
- [ ] Calendar view

-----

### V3 — Intelligence

- [ ] AI assistance: summarise notes, suggest to-dos, recommend techniques
- [ ] Auto-structure pasted text into material lists and steps
- [ ] Visual similarity search (“find projects that look like this”)
- [ ] Collaboration and sharing

-----

## Design Principles

1. **Low friction above all.** The app should never feel like a chore to use. No required fields, no complex forms. Start with: write something → saved.
1. **Flexible structure.** An idea can be a single line. A project can have dozens of logs, images, and variants. Both are first-class citizens.
1. **Prose and structure together.** The app supports free-form notes *and* structured data (dimensions, temperatures, checklists) — not one or the other.
1. **Built for physical work.** Features are designed around the realities of workshop use: dirty hands, poor connectivity, time gaps between sessions.

-----

## Target User

Anyone doing **process-based creative or physical work** — ceramicists, woodworkers, knitters, painters, jewellers, home brewers, gardeners — who wants a single place to capture, plan, document, and learn from their practice.