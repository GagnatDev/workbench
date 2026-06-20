import type { Project } from '@/db/types'

/**
 * Built-in default project covers: abstract, on-brand SVG motifs drawn from the
 * visual-identity palette (tailwind.config.js). A project with no chosen cover and
 * no photo falls back to one of these (picked deterministically from its id), so a
 * photo-less promotion never looks empty; the user can also pick one explicitly.
 *
 * Each motif is full-bleed (the background rect fills the viewBox) and rendered
 * through an <img> with `object-cover`, so the same asset fills both the 20×20 list
 * thumbnail and the wide `max-h-64` overview hero without distortion.
 */

// Palette (docs/visual-identity.md / tailwind.config.js).
const OATMEAL = '#F4F1EA'
const STONEWARE = '#E3DFD5'
const TERRACOTTA = '#C87A63'
const OLIVE = '#7A826B'
const FLAX = '#D9A752'

/** The built-in motif keys (also the `cover.motif.*` i18n label keys). */
export type CoverKey = 'woven' | 'arcs' | 'dots' | 'grid' | 'pebbles'

export interface DefaultCover {
  key: CoverKey
  svg: string
}

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">${body}</svg>`

/** The default motifs, in display order. Keys are stable (stored in `project.cover`). */
export const DEFAULT_COVERS: DefaultCover[] = [
  {
    // Woven — warp/weft stripes.
    key: 'woven',
    svg: svg(
      `<rect width="120" height="120" fill="${OATMEAL}"/>` +
        Array.from({ length: 6 }, (_, i) => `<rect x="${i * 20 + 4}" y="0" width="9" height="120" fill="${TERRACOTTA}" opacity="0.22"/>`).join('') +
        Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${i * 20 + 4}" width="120" height="9" fill="${OLIVE}" opacity="0.22"/>`).join(''),
    ),
  },
  {
    // Arcs — concentric quarter-circles from a corner.
    key: 'arcs',
    svg: svg(
      `<rect width="120" height="120" fill="${STONEWARE}"/>` +
        [18, 38, 58, 78, 98].map((r, i) => `<circle cx="0" cy="120" r="${r}" fill="none" stroke="${OLIVE}" stroke-width="6" opacity="${0.5 - i * 0.06}"/>`).join(''),
    ),
  },
  {
    // Dots — a calm scatter grid.
    key: 'dots',
    svg: svg(
      `<rect width="120" height="120" fill="${OATMEAL}"/>` +
        [20, 50, 80, 110]
          .flatMap((y) => [20, 50, 80, 110].map((x) => `<circle cx="${x}" cy="${y}" r="7" fill="${FLAX}" opacity="0.45"/>`))
          .join(''),
    ),
  },
  {
    // Grid — soft hairline lattice.
    key: 'grid',
    svg: svg(
      `<rect width="120" height="120" fill="${STONEWARE}"/>` +
        [24, 48, 72, 96].map((p) => `<line x1="${p}" y1="0" x2="${p}" y2="120" stroke="${TERRACOTTA}" stroke-width="3" opacity="0.3"/>`).join('') +
        [24, 48, 72, 96].map((p) => `<line x1="0" y1="${p}" x2="120" y2="${p}" stroke="${TERRACOTTA}" stroke-width="3" opacity="0.3"/>`).join(''),
    ),
  },
  {
    // Pebbles — overlapping organic blobs.
    key: 'pebbles',
    svg: svg(
      `<rect width="120" height="120" fill="${OATMEAL}"/>` +
        `<circle cx="38" cy="44" r="34" fill="${TERRACOTTA}" opacity="0.32"/>` +
        `<circle cx="86" cy="78" r="40" fill="${OLIVE}" opacity="0.3"/>` +
        `<circle cx="92" cy="30" r="20" fill="${FLAX}" opacity="0.4"/>`,
    ),
  },
]

const COVER_BY_KEY = new Map<string, DefaultCover>(DEFAULT_COVERS.map((c) => [c.key, c]))

/** True if `key` names a known default motif (guards against stale stored keys). */
export function isDefaultCover(key: string): boolean {
  return COVER_BY_KEY.has(key)
}

/** An inline `data:` URL for a motif, usable as an `<img src>`. Falls back to the first motif. */
export function coverDataUrl(key: string): string {
  const cover = COVER_BY_KEY.get(key) ?? DEFAULT_COVERS[0]!
  return `data:image/svg+xml,${encodeURIComponent(cover.svg)}`
}

/**
 * Deterministically pick a default motif for a project from its id, so a photo-less
 * project always shows the same (varied across projects) motif until one is chosen.
 */
export function defaultCoverForProject(project: Pick<Project, 'id'>): string {
  let hash = 0
  for (let i = 0; i < project.id.length; i++) hash = (hash * 31 + project.id.charCodeAt(i)) >>> 0
  return DEFAULT_COVERS[hash % DEFAULT_COVERS.length]!.key
}
