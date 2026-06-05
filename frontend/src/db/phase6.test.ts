import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// As in phase3/4/5: db ops call writeLocal → schedule a sync; stub the network
// seam and the scheduler so these stay pure local-store tests.
vi.mock('@/auth/authClient', () => ({
  authClient: { authedFetch: vi.fn(), getAccessToken: () => 't', disabled: true },
}))

const { db } = await import('./db')
const { syncEngine } = await import('./sync')
const { createProject, updateProject, allProjectTags } = await import('./projects')
const { SYNC_TABLES } = await import('./types')
const { matchesTags, collectTags } = await import('@/lib/tags')

beforeEach(async () => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()))
  await db._meta.clear()
})

describe('matchesTags (local filtering, AND semantics)', () => {
  it('an empty filter matches everything', () => {
    expect(matchesTags(['raku'], [])).toBe(true)
    expect(matchesTags(undefined, [])).toBe(true)
  })

  it('requires every active tag to be present', () => {
    expect(matchesTags(['raku', 'blue'], ['raku'])).toBe(true)
    expect(matchesTags(['raku', 'blue'], ['raku', 'blue'])).toBe(true)
    expect(matchesTags(['raku'], ['raku', 'blue'])).toBe(false)
    expect(matchesTags(undefined, ['raku'])).toBe(false)
  })
})

describe('collectTags', () => {
  it('returns distinct tags, sorted, tolerating missing arrays', () => {
    const rows = [{ tags: ['b', 'a'] }, { tags: ['a'] }, {}, { tags: ['c'] }]
    expect(collectTags(rows)).toEqual(['a', 'b', 'c'])
  })
})

describe('project tags', () => {
  it('a new project starts with an empty tag list', async () => {
    const id = await createProject('Raku test', 'kanban')
    const project = (await db.projects.get(id))!
    expect(project.tags).toEqual([])
  })

  it('updateProject persists tags and marks the row dirty', async () => {
    const id = await createProject('Raku test', 'kanban')
    const project = (await db.projects.get(id))!
    await updateProject(project, { tags: ['raku', 'blue'] })
    const updated = (await db.projects.get(id))!
    expect(updated.tags).toEqual(['raku', 'blue'])
    expect(updated._dirty).toBe(1)
  })

  it('allProjectTags gathers distinct tags across live projects only', async () => {
    const a = await createProject('A', 'kanban')
    const b = await createProject('B', 'kanban')
    await updateProject((await db.projects.get(a))!, { tags: ['raku', 'blue'] })
    await updateProject((await db.projects.get(b))!, { tags: ['raku', 'glaze'] })
    expect(await allProjectTags()).toEqual(['blue', 'glaze', 'raku'])

    // A tombstoned project's tags drop out of the suggestion set.
    await db.projects.update(b, { deleted: true })
    expect(await allProjectTags()).toEqual(['blue', 'raku'])
  })
})
