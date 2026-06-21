# Workbench — Visual Identity

> **Status:** Approved — ready for implementation · **Date:** 2026-06-03 · **Author:** Ann-Katrin Gagnat
> Companion to [`workbench-prd.md`](./workbench-prd.md) and [`ui-ux-design.md`](./ui-ux-design.md). This document defines the look and feel: palette, typography, and surface treatment. The UI/UX doc defines *what* is on screen; this one defines *how it looks*.

## Direction: functional minimalism, raw elements

Workbench is a private tool for a handful of makers — there is zero commercial pressure, no branding to sell, no engagement to maximize. The identity strips away visual clutter, leaving soft natural tones, clean layouts, and plenty of breathing room so the screen recedes behind the craft notes, measurements, and photos it holds. It should feel like a neatly organized, high-end independent craft magazine: slow, deliberate, utilitarian.

The palette mirrors the raw, natural materials of the crafts it serves — clay, wool, oils, botanical dyes.

---

## 🎨 Color palette

A 60/30/10 split: matte organic neutrals dominate; earthy tones structure; one warm highlight marks what's interactive.

| Hex | Name | Role |
|-----|------|------|
| `#F4F1EA` | **Oatmeal** | Base background (60%). Tinted, matte — reduces eye strain, feels organic. |
| `#E3DFD5` | **Stoneware** | Secondary background: cards, sheets, section previews, input fields. |
| `#5C5A56` | **Charcoal** | Primary text. Soft near-black, never pure `#000`. |
| `#C87A63` | **Terracotta** | Accent 1 — fired clay. |
| `#7A826B` | **Olive** | Accent 2 — botanical dye, natural lye. |
| `#D9A752` | **Flax** | Accent 3 — bleached flax / yarn. |

**Usage rules**

- **Terracotta is the primary interactive color**: the ➕ capture button, primary buttons (`Create →`), active tab/rail icon, links, focused inputs, active filter chips. If it's terracotta, you can tap it.
- **Olive carries calm/positive state**: the synced sync-dot, checked checklist tasks, success toasts.
- **Flax is the sparse highlight**: favourite ★, the current stage in the status sheet, unprocessed-inbox badges. Used at ~10% or less — its job is to be rare.
- Secondary text and metadata (timestamps, "2d ago", captions) use Charcoal at reduced strength (`#8A8782`); hairline dividers use `#D8D4C9`.
- Status badges, collection chips, and tag chips are **tinted Stoneware with Charcoal text** by default — color is not used to encode per-craft or per-tag meaning (collections are user-defined; a fixed craft→color map wouldn't survive contact with real data).
- Sync states: olive dot = synced · terracotta spinner = syncing · charcoal ⊕ = offline-pending · a muted brick red (`#A8524A`, derived from terracotta) = error. The error red appears nowhere else.

---

## 🔤 Typography

Editorial headers over a utilitarian body — the craft-magazine pairing.

| Role | Face | Notes |
|------|------|-------|
| **Headers** | Editorial high-contrast serif — **Playfair Display** (self-hostable) | Project titles, screen titles, section names. Its thick/thin stroke contrast brings the craft-magazine elegance to the things you've named. Used **sparingly and only at title sizes** (see rule below) so it reads editorial, not formal. |
| **Body** | Clean geometric sans — **Inter** (self-hostable) with `Helvetica Neue`/system-ui fallback | Everything else. High contrast, generous spacing — a recipe or stitch count must be readable from across the workbench. |
| **Data** | Inter with tabular numerals (`font-variant-numeric: tabular-nums`) | Details key–value block, quantities, temperatures, dates. |

- Body text minimum **16px**, line-height ≥ 1.5; metadata no smaller than 13px.
- Serif is reserved for *titles only* — never for body or UI labels. With a high-contrast face like Playfair this is doubly important: at small sizes the thin strokes thin out and the magazine feel tips into costume.
- Fonts are **self-hosted and precached by the PWA service worker** — typography cannot depend on connectivity (offline is the normal case, not the exception).

---

## 📐 Surfaces & layout

Every screen serves a strict utility function — no decorative graphics, no illustration system, no gradients.

- **Generous whitespace.** Large margins around text blocks; screens stay calm even when dense with measurements. When in doubt, add space rather than a border.
- **Borderless containers.** Sections separate by subtle color blocking (Stoneware on Oatmeal) or thin light dividers — not bulky outlined boxes. Cards get a soft 12px radius and at most a whisper of shadow.
- **Photos are the decoration.** The user's own work — journal photos, moodboard pins, project thumbnails — provides all the visual richness. The chrome's job is to frame it neutrally; never place imagery of our own next to theirs.
- **Functional anchors for workshop hands.** High-contrast, oversized tap targets (minimum 44px, prefer larger) on the things used mid-work: the capture ➕, checklist toggles, the journal camera button, the status chip. Designed for wet clay, soapy fingers, and yarn-occupied hands.
- **Motion is minimal and physical**: sheets slide, lifted drag-items get a slight scale + shadow, nothing bounces or attracts attention for its own sake.

---

## Component cues

How the identity lands on the key screens from [`ui-ux-design.md`](./ui-ux-design.md):

- **Bottom bar / rail** — Oatmeal with a hairline top divider; inactive icons Charcoal-muted, active icon Terracotta. The ➕ is a filled Terracotta circle, slightly raised — the single most prominent element in the app.
- **Capture sheet & composers** — Stoneware surface, serif-free, placeholder text in muted Charcoal; the destination chip is a small Stoneware pill.
- **Inbox cards** — Stoneware on Oatmeal; swipe right reveals the olive keep underlay, swipe left the terracotta archive underlay; a long-press promotes.
- **Project cards** — photo thumbnail left, serif title, Stoneware status badge, muted "2d ago".
- **Journal feed** — date dividers as thin rules with small-caps muted labels; entries are plain text on the base background (no per-entry card boxes — the feed reads as a page, not a stack of widgets).
- **Moodboard** — masonry images carry no frames; link pins are Stoneware cards with a Terracotta 🔗 glyph.
- **Empty states** — a single line of muted text plus one Terracotta action; no illustrations.

---

## App icon

**Decision:** the real install mark is **designed before Phase 1** (not placeholdered), so it ships once. Direction: a single simple glyph — a vessel silhouette or ⌂-like workbench form — in Charcoal on Oatmeal, no wordmark. Provide the full PWA icon set (maskable + any-purpose, 192/512px) and a matching `theme_color`/`background_color` (Oatmeal) for the manifest.

## Open questions

- **Dark mode** — deferred from V1. The matte Oatmeal palette has no obvious dark inversion; if evening-studio use demands it, design a true companion palette (warm dark clay tones) rather than auto-inverting.
