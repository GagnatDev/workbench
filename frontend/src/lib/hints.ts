import type { ParseKeys } from 'i18next'
import { matchPath } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Section } from '@/db/types'

type SectionKind = Section['kind']

/**
 * Lightweight onboarding hints (ui-ux-design.md §9.3, extended): a calm, dismissible
 * banner per screen that points out a feature a newcomer may not have discovered yet.
 * Not a wizard — one hint shows above the page, persists until dismissed, then never
 * returns. Everything is client-local in the Dexie `_meta` table so it needs no backend
 * and stays reactive via `useLiveQuery`; account deletion wipes `_meta`, so a re-created
 * account starts fresh.
 */
export interface Hint {
  /** Stable id; also the seen-state key suffix. */
  id: string
  /** react-router path pattern for the screen this hint belongs to. */
  pattern: string
  /** Match the pattern exactly (no descendant routes). */
  end?: boolean
  /** i18n key for the hint copy. */
  key: ParseKeys
  /** Only show on a section of this kind (the body UI differs per kind). */
  sectionKind?: SectionKind
  /** Only show once the global inbox has at least one idea — a swipe hint is
   *  meaningless on an empty inbox, so it appears after the first capture. */
  requiresInboxIdeas?: boolean
}

/** Reactive facts the registry conditions read; gathered once in HintBanner. */
export interface HintContext {
  /** Kind of the section currently open, or null when not on a section. */
  sectionKind: SectionKind | null
  /** Whether the global inbox holds at least one (non-deleted) idea. */
  hasInboxIdeas: boolean
}

const SECTION_ROUTE = '/projects/:id/sections/:sid'

/**
 * Ordered registry. On a given screen the first enabled, unseen hint wins. The section
 * hints share one route and are disambiguated by `sectionKind`; the broader
 * project-overview hint is `end: true` so it never matches a section route.
 */
export const HINTS: Hint[] = [
  { id: 'inbox', pattern: '/inbox', end: true, key: 'hints.inbox', requiresInboxIdeas: true },
  { id: 'projects', pattern: '/projects', end: true, key: 'hints.projects' },
  { id: 'section-journal', pattern: SECTION_ROUTE, sectionKind: 'journal', key: 'hints.section_journal' },
  { id: 'section-moodboard', pattern: SECTION_ROUTE, sectionKind: 'moodboard', key: 'hints.section_moodboard' },
  { id: 'section-checklist', pattern: SECTION_ROUTE, sectionKind: 'checklist', key: 'hints.section_checklist' },
  { id: 'section-materials', pattern: SECTION_ROUTE, sectionKind: 'materials', key: 'hints.section_materials' },
  { id: 'project-overview', pattern: '/projects/:id', end: true, key: 'hints.project_overview' },
]

const ENABLED_KEY = 'hints-enabled'
const SEEN_PREFIX = 'hint-seen:'
const seenKey = (id: string): string => SEEN_PREFIX + id

/** The hint to show for a path: first enabled, unseen registry entry that matches the
 *  route and whose data conditions hold. */
export function activeHint(pathname: string, seen: Set<string>, ctx: HintContext): Hint | null {
  return (
    HINTS.find((h) => {
      if (seen.has(h.id)) return false
      if (!matchPath({ path: h.pattern, end: h.end ?? false }, pathname)) return false
      if (h.sectionKind && h.sectionKind !== ctx.sectionKind) return false
      if (h.requiresInboxIdeas && !ctx.hasInboxIdeas) return false
      return true
    }) ?? null
  )
}

/** The :sid of the section route for `pathname`, or null when not on one. */
export function sectionIdOf(pathname: string): string | null {
  return matchPath({ path: SECTION_ROUTE, end: false }, pathname)?.params.sid ?? null
}

/** Whether hints are enabled. Absent row means the default: on. */
export function useHintsEnabled(): boolean {
  return useLiveQuery(async () => (await db._meta.get(ENABLED_KEY))?.value !== '0', [], true)
}

export async function setHintsEnabled(on: boolean): Promise<void> {
  await db._meta.put({ key: ENABLED_KEY, value: on ? '1' : '0' })
}

/** The set of dismissed hint ids. */
export function useSeenHints(): Set<string> {
  return useLiveQuery(
    async () => {
      const rows = await db._meta.where('key').startsWith(SEEN_PREFIX).toArray()
      return new Set(rows.map((r) => r.key.slice(SEEN_PREFIX.length)))
    },
    [],
    new Set<string>(),
  )
}

export async function markHintSeen(id: string): Promise<void> {
  await db._meta.put({ key: seenKey(id), value: '1' })
}

/** Forget every dismissal so the hints replay. */
export async function resetHints(): Promise<void> {
  const keys = await db._meta.where('key').startsWith(SEEN_PREFIX).primaryKeys()
  await db._meta.bulkDelete(keys)
}
