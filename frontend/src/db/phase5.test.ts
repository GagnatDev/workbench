import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// As in phase3/phase4: the db ops call writeLocal → schedule a sync; stub the
// network seam and the scheduler so these stay pure local-store tests.
vi.mock('@/auth/authClient', () => ({
  authClient: { authedFetch: vi.fn(), getAccessToken: () => 't', disabled: true },
}))

const { db } = await import('./db')
const { syncEngine } = await import('./sync')
const { createSection, sectionsOfProject, deleteSection, defaultSectionName } = await import(
  './sections'
)
const {
  createItem,
  itemsOfSection,
  toggleTask,
  setItemRank,
  deleteItem,
  addItemPhoto,
} = await import('./items')
const { validatePayload, emptyPayload } = await import('./payload')
const { captureIdea, fileIdea } = await import('./ideas')
const { createProject, deleteProject } = await import('./projects')
const { SYNC_TABLES } = await import('./types')
const { rankBefore } = await import('@/lib/rank')

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

describe('payload validation', () => {
  it('accepts well-formed payloads per kind', () => {
    expect(validatePayload('journal', { entry_at: new Date().toISOString() })).toBeTruthy()
    expect(validatePayload('checklist', { done: true })).toEqual({ done: true })
    expect(validatePayload('moodboard', { subtype: 'image' })).toEqual({ subtype: 'image' })
    expect(validatePayload('moodboard', { subtype: 'link', url: 'x' })).toBeTruthy()
    expect(validatePayload('materials', { quantity: '2', unit: 'kg' })).toBeTruthy()
  })

  it('rejects malformed payloads', () => {
    expect(() => validatePayload('journal', {})).toThrow() // entry_at required
    expect(() => validatePayload('checklist', { done: 'yes' })).toThrow()
    expect(() => validatePayload('moodboard', { subtype: 'link' })).toThrow() // url required
    expect(() => validatePayload('moodboard', { subtype: 'other' })).toThrow()
  })

  it('emptyPayload produces a valid starting payload for every kind', () => {
    for (const kind of ['journal', 'checklist', 'moodboard', 'materials'] as const) {
      expect(() => validatePayload(kind, emptyPayload(kind))).not.toThrow()
    }
  })
})

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

describe('createItem', () => {
  it('validates the payload against the section kind, dirty, ranked at the end', async () => {
    const pid = await createProject('P', 'kanban')
    const journal = await section(pid, 'journal')
    const at = new Date().toISOString()
    const i1 = await createItem(journal, { body: 'first', payload: { entry_at: at } })
    const i2 = await createItem(journal, { body: 'second', payload: { entry_at: at } })
    const items = await itemsOfSection(journal.id)
    expect(items.map((i) => i.id)).toEqual([i1, i2])
    expect((await db.items.get(i1))!._dirty).toBe(1)
  })

  it('throws (and writes nothing) on an invalid payload', async () => {
    const pid = await createProject('P', 'kanban')
    const checklist = await section(pid, 'checklist')
    await expect(createItem(checklist, { title: 'x', payload: {} })).rejects.toThrow()
    expect(await itemsOfSection(checklist.id)).toHaveLength(0)
  })

  it('stores a photo as an item-owned attachment + local blob', async () => {
    const pid = await createProject('P', 'kanban')
    const journal = await section(pid, 'journal')
    const photoId = crypto.randomUUID()
    const blob = new Blob(['x'], { type: 'image/png' })
    const itemId = await createItem(journal, {
      body: 'with photo',
      payload: { entry_at: new Date().toISOString() },
      photo: { id: photoId, blob },
    })
    const att = (await db.attachments.get(photoId))!
    expect(att).toMatchObject({ owner_type: 'item', owner_id: itemId, uploaded: false })
    expect(await db.blobs.get(photoId)).toBeDefined() // blob stored locally pre-upload
  })
})

describe('item operations', () => {
  it('toggles a task done flag', async () => {
    const pid = await createProject('P', 'kanban')
    const checklist = await section(pid, 'checklist')
    const id = await createItem(checklist, { title: 'do it', payload: { done: false } })
    await toggleTask((await db.items.get(id))!)
    expect((await db.items.get(id))!.payload).toEqual({ done: true })
    await toggleTask((await db.items.get(id))!)
    expect((await db.items.get(id))!.payload).toEqual({ done: false })
  })

  it('reorders via an explicit rank', async () => {
    const pid = await createProject('P', 'kanban')
    const cl = await section(pid, 'checklist')
    const a = await createItem(cl, { title: 'a', payload: { done: false } })
    const b = await createItem(cl, { title: 'b', payload: { done: false } })
    // Move b before a by minting a rank strictly below a's (as a drop would).
    const aRank = (await db.items.get(a))!.rank
    await setItemRank((await db.items.get(b))!, rankBefore(aRank))
    const order = (await itemsOfSection(cl.id)).map((i) => i.title)
    expect(order).toEqual(['b', 'a'])
  })

  it('deletes an item and cascades its attachments', async () => {
    const pid = await createProject('P', 'kanban')
    const mb = await section(pid, 'moodboard')
    const id = await createItem(mb, { payload: { subtype: 'image' } })
    const attId = await addItemPhoto(id, new Blob(['x'], { type: 'image/png' }))
    await deleteItem(id)
    expect((await db.items.get(id))!.deleted).toBe(true)
    expect((await db.attachments.get(attId))!.deleted).toBe(true)
  })
})

describe('fileIdea', () => {
  it('files into a journal: body carries content, entry_at = capture time, photo re-pointed, idea filed', async () => {
    const pid = await createProject('Cups', 'ceramics')
    const journal = await section(pid, 'journal')

    const photoId = crypto.randomUUID()
    const ideaId = (await captureIdea(
      { text: 'thin rims', link: '', photo: { id: photoId, blob: new Blob(['x'], { type: 'image/png' }), url: 'blob:x' } },
      pid,
    ))!
    const idea = (await db.ideas.get(ideaId))!

    const itemId = await fileIdea(idea, journal)
    const item = (await db.items.get(itemId))!
    expect(item.body).toBe('thin rims')
    expect((item.payload as { entry_at: string }).entry_at).toBe(idea.created_at)

    // The idea's photo now belongs to the new item.
    const att = (await db.attachments.get(photoId))!
    expect(att).toMatchObject({ owner_type: 'item', owner_id: itemId })

    expect((await db.ideas.get(ideaId))!.state).toBe('filed')
  })

  it('files a linked idea into a moodboard as a link pin', async () => {
    const pid = await createProject('P', 'kanban')
    const mb = await section(pid, 'moodboard')
    const ideaId = (await captureIdea({ text: 'glaze vid', link: 'https://youtu.be/x', photo: null }, pid))!
    const itemId = await fileIdea((await db.ideas.get(ideaId))!, mb)
    const item = (await db.items.get(itemId))!
    expect(item.payload).toEqual({ subtype: 'link', url: 'https://youtu.be/x' })
    expect(item.title).toBe('glaze vid')
  })

  it('files into a checklist with the content as the task title', async () => {
    const pid = await createProject('P', 'kanban')
    const cl = await section(pid, 'checklist')
    const ideaId = (await captureIdea({ text: 'order glaze', link: '', photo: null }, pid))!
    const itemId = await fileIdea((await db.ideas.get(ideaId))!, cl)
    const item = (await db.items.get(itemId))!
    expect(item.title).toBe('order glaze')
    expect(item.payload).toEqual({ done: false })
  })
})

describe('cascading deletes', () => {
  it('deleteSection tombstones items and their attachments', async () => {
    const pid = await createProject('P', 'kanban')
    const mb = await section(pid, 'moodboard')
    const itemId = await createItem(mb, { payload: { subtype: 'image' } })
    const attId = await addItemPhoto(itemId, new Blob(['x'], { type: 'image/png' }))

    await deleteSection(mb.id)
    expect((await db.sections.get(mb.id))!.deleted).toBe(true)
    expect((await db.items.get(itemId))!.deleted).toBe(true)
    expect((await db.attachments.get(attId))!.deleted).toBe(true)
  })

  it('deleteProject cascades through sections, items, and attachments', async () => {
    const pid = await createProject('P', 'ceramics')
    const journal = await section(pid, 'journal')
    const itemId = await createItem(journal, {
      body: 'x',
      payload: { entry_at: new Date().toISOString() },
    })
    const attId = await addItemPhoto(itemId, new Blob(['x'], { type: 'image/png' }))

    await deleteProject(pid)
    expect((await db.projects.get(pid))!.deleted).toBe(true)
    expect((await db.sections.get(journal.id))!.deleted).toBe(true)
    expect((await db.items.get(itemId))!.deleted).toBe(true)
    expect((await db.attachments.get(attId))!.deleted).toBe(true)
  })
})
