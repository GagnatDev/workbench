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
  materialSuggestions,
  cloneMaterial,
} = await import('./items')
const { validatePayload, emptyPayload } = await import('./payload')
const { captureIdea, fileIdea } = await import('./ideas')
const { createProject, deleteProject, setProjectCollection, updateProject } =
  await import('./projects')
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

describe('materialSuggestions', () => {
  const project = async (pid: string) => (await db.projects.get(pid))!
  /** A materials section with one named material carrying a unit. */
  async function material(pid: string, name: string, unit: string) {
    const sec = await section(pid, 'materials')
    await createItem(sec, { title: name, payload: { quantity: '', unit } })
    return sec
  }

  it('suggests materials from a project sharing the collection, not unrelated ones', async () => {
    const a = await createProject('A', 'ceramics')
    const b = await createProject('B', 'ceramics')
    const c = await createProject('C', 'textiles')
    await setProjectCollection(await project(a), 'shelf')
    await setProjectCollection(await project(b), 'shelf')
    await setProjectCollection(await project(c), 'loom')

    await material(a, 'Clear glaze', 'ml')
    await material(c, 'Cotton warp', 'm')
    const target = await material(b, 'Stoneware', 'kg')

    const names = (await materialSuggestions(target)).map((s) => s.name)
    expect(names).toContain('Clear glaze')
    expect(names).not.toContain('Cotton warp')
  })

  it('suggests materials from a project sharing a tag', async () => {
    const a = await createProject('A', 'ceramics')
    const b = await createProject('B', 'ceramics')
    await updateProject(await project(a), { tags: ['mugs'] })
    await updateProject(await project(b), { tags: ['mugs'] })

    await material(a, 'Clear glaze', 'ml')
    const target = await section(b, 'materials')

    expect((await materialSuggestions(target)).map((s) => s.name)).toContain('Clear glaze')
  })

  it("carries the most recently used material's unit", async () => {
    const a = await createProject('A', 'ceramics')
    const b = await createProject('B', 'ceramics')
    await setProjectCollection(await project(a), 'shelf')
    await setProjectCollection(await project(b), 'shelf')

    const secA = await material(a, 'Clear glaze', 'g')
    const oldId = (await itemsOfSection(secA.id))[0]!.id
    const secB = await material(b, 'Clear glaze', 'ml')
    const newId = (await itemsOfSection(secB.id))[0]!.id
    // Pin deterministic timestamps so "newest unit wins" doesn't hinge on ms ties.
    await db.items.update(oldId, { updated_at: '2026-01-01T00:00:00.000Z' })
    await db.items.update(newId, { updated_at: '2026-02-01T00:00:00.000Z' })

    const target = await section(b, 'materials')
    const glaze = (await materialSuggestions(target)).find((s) => s.name === 'Clear glaze')
    expect(glaze?.unit).toBe('ml')
  })

  it('dedupes by name and still returns names already in the current section', async () => {
    const a = await createProject('A', 'ceramics')
    await setProjectCollection(await project(a), 'shelf')
    const sec = await material(a, 'Clear glaze', 'ml')
    await createItem(sec, { title: 'Clear glaze', payload: { quantity: '', unit: 'ml' } })

    const result = await materialSuggestions(sec)
    expect(result.filter((s) => s.name === 'Clear glaze')).toHaveLength(1)
  })
})

describe('cloneMaterial', () => {
  it('copies name, unit, notes, and tags but leaves quantity blank', async () => {
    const pid = await createProject('P', 'ceramics')
    const src = await section(pid, 'materials')
    const sourceId = await createItem(src, {
      title: 'Clear glaze',
      body: 'Two coats',
      payload: { quantity: '500', unit: 'ml' },
      tags: ['glossy'],
    })

    const dest = await section(pid, 'materials')
    const newId = (await cloneMaterial(dest, sourceId))!
    const clone = (await db.items.get(newId))!

    expect(clone.section_id).toBe(dest.id)
    expect(clone.title).toBe('Clear glaze')
    expect(clone.body).toBe('Two coats')
    expect(clone.tags).toEqual(['glossy'])
    expect(clone.payload).toEqual({ quantity: '', unit: 'ml' })
  })

  it("duplicates the source's photo without moving it", async () => {
    const pid = await createProject('P', 'ceramics')
    const src = await section(pid, 'materials')
    const sourceId = await createItem(src, { title: 'Clear glaze', payload: { quantity: '', unit: 'ml' } })
    const srcAtt = await addItemPhoto(sourceId, new Blob(['img'], { type: 'image/png' }))

    const dest = await section(pid, 'materials')
    const newId = (await cloneMaterial(dest, sourceId))!

    const cloneAtts = (await db.attachments.where('owner_id').equals(newId).toArray()).filter(
      (a) => !a.deleted,
    )
    expect(cloneAtts).toHaveLength(1)
    expect(cloneAtts[0]!.id).not.toBe(srcAtt)
    // The source keeps its own photo (a copy, not a move).
    expect((await db.attachments.get(srcAtt))!.deleted).toBeFalsy()
    expect((await db.attachments.get(srcAtt))!.owner_id).toBe(sourceId)
  })

  it('returns null when the source item is gone', async () => {
    const pid = await createProject('P', 'ceramics')
    const dest = await section(pid, 'materials')
    expect(await cloneMaterial(dest, 'missing')).toBeNull()
  })
})
