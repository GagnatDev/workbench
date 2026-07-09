import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db ops call writeLocal → schedule a sync; stub the network seam and the
// scheduler so these stay pure local-store tests.
vi.mock('@/auth/authClient', () => ({
  authClient: { authedFetch: vi.fn(), getAccessToken: () => 't', disabled: true },
}))

const { db } = await import('./db')
const { syncEngine } = await import('./sync')
const { createSection, sectionsOfProject, deleteSection, defaultSectionName } = await import(
  './sections'
)
const { createItem, addItemPhoto } = await import('./items')
const { createProject } = await import('./projects')
const { SYNC_TABLES } = await import('./types')

beforeEach(async () => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()))
  await db.blobs.clear()
  await db._meta.clear()
})

async function section(projectId: string, kind: 'journal' | 'moodboard' | 'checklist' | 'materials') {
  const id = await createSection(projectId, kind, '')
  return (await db.sections.get(id))!
}

describe('createSection', () => {
  it('appends in rank order and falls back to the kind label for a blank name', async () => {
    const pid = await createProject('P', 'kanban')
    const a = await createSection(pid, 'journal', 'Notes')
    const b = await createSection(pid, 'checklist', '')
    const list = await sectionsOfProject(pid)
    expect(list.map((s) => s.id)).toEqual([a, b]) // appended after, rank order
    expect((await db.sections.get(b))!.name).toBe(defaultSectionName('checklist'))
  })
})

describe('deleteSection', () => {
  it('tombstones items and their attachments', async () => {
    const pid = await createProject('P', 'kanban')
    const mb = await section(pid, 'moodboard')
    const itemId = await createItem(mb, { payload: { subtype: 'image' } })
    const attId = await addItemPhoto(itemId, new Blob(['x'], { type: 'image/png' }))

    await deleteSection(mb.id)
    expect((await db.sections.get(mb.id))!.deleted).toBe(true)
    expect((await db.items.get(itemId))!.deleted).toBe(true)
    expect((await db.attachments.get(attId))!.deleted).toBe(true)
  })
})
