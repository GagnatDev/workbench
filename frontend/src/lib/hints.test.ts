import { describe, expect, it } from 'vitest'
import { activeHint, HINTS, sectionIdOf, type HintContext } from './hints'

const NONE = new Set<string>()
const ctx = (over: Partial<HintContext> = {}): HintContext => ({
  sectionKind: null,
  hasInboxIdeas: false,
  ...over,
})

describe('activeHint', () => {
  it('matches each screen to its hint', () => {
    expect(activeHint('/inbox', NONE, ctx({ hasInboxIdeas: true }))?.id).toBe('inbox')
    expect(activeHint('/projects', NONE, ctx())?.id).toBe('projects')
    expect(activeHint('/projects/p1', NONE, ctx())?.id).toBe('project-overview')
  })

  it('shows the swipe hint only once the inbox has an idea', () => {
    expect(activeHint('/inbox', NONE, ctx({ hasInboxIdeas: false }))).toBeNull()
    expect(activeHint('/inbox', NONE, ctx({ hasInboxIdeas: true }))?.id).toBe('inbox')
  })

  it('picks the section hint matching the open section kind', () => {
    const path = '/projects/p1/sections/s1'
    expect(activeHint(path, NONE, ctx({ sectionKind: 'materials' }))?.id).toBe('section-materials')
    expect(activeHint(path, NONE, ctx({ sectionKind: 'checklist' }))?.id).toBe('section-checklist')
    expect(activeHint(path, NONE, ctx({ sectionKind: 'journal' }))?.id).toBe('section-journal')
  })

  it('shows no section hint until the kind is known', () => {
    expect(activeHint('/projects/p1/sections/s1', NONE, ctx({ sectionKind: null }))).toBeNull()
  })

  it('skips a dismissed hint', () => {
    expect(activeHint('/inbox', new Set(['inbox']), ctx({ hasInboxIdeas: true }))).toBeNull()
  })

  it('returns null on a screen with no hint', () => {
    expect(activeHint('/settings', NONE, ctx())).toBeNull()
    expect(activeHint('/inbox/archived', NONE, ctx({ hasInboxIdeas: true }))).toBeNull()
  })

  it('every hint has a unique id', () => {
    expect(new Set(HINTS.map((h) => h.id)).size).toBe(HINTS.length)
  })
})

describe('sectionIdOf', () => {
  it('extracts the section id from a section route', () => {
    expect(sectionIdOf('/projects/p1/sections/s9')).toBe('s9')
  })

  it('is null off the section route', () => {
    expect(sectionIdOf('/projects/p1')).toBeNull()
    expect(sectionIdOf('/inbox')).toBeNull()
  })
})
