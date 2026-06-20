import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db ops call writeLocal, which schedules a sync; stub the network seam and
// the scheduler so these stay pure local-store tests (mirrors phase3.test.ts).
vi.mock('@/auth/authClient', () => ({
  authClient: { authedFetch: vi.fn(), getAccessToken: () => 't', disabled: true },
}))

const { db } = await import('./db')
const { syncEngine, writeLocal, deleteLocal } = await import('./sync')
const {
  createProject,
  setProjectStatus,
  setProjectStages,
  setProjectDetails,
  toggleFavourite,
  setProjectCollection,
  deleteProject,
  loadProjectCards,
} = await import('./projects')
const { createCollection, renameCollection, deleteCollection, allCollections } = await import(
  './collections'
)
const { captureIdea, promoteIdea, projectIdeaPhotos } = await import('./ideas')
const { SYNC_TABLES } = await import('./types')
const i18n = (await import('@/i18n')).default

beforeEach(async () => {
  // Template seeds are localized (Norwegian-first); pin English so these
  // template-content assertions are deterministic regardless of saved locale.
  await i18n.changeLanguage('en')
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()))
  await db.blobs.clear()
  await db._meta.clear()
})

describe('createProject', () => {
  it('seeds stages, status, and suggested detail keys from the template, dirty', async () => {
    const id = await createProject('Blue Cups', 'ceramics')
    const p = (await db.projects.get(id))!
    expect(p).toMatchObject({ title: 'Blue Cups', status: 'Planning', favourite: false, _dirty: 1 })
    expect(p.stages[0]).toBe('Planning')
    expect(Object.keys(p.details)).toContain('Clay body')
    expect(p.details['Clay body']).toBe('') // seeded blank — a fillable hint
    expect((await db._meta.get('lastTemplate'))?.value).toBe('ceramics')
  })

  it('falls back to a default title and places new projects at the top', async () => {
    const first = await createProject('First', 'kanban')
    const second = await createProject('   ', 'kanban')
    const p2 = (await db.projects.get(second))!
    const p1 = (await db.projects.get(first))!
    expect(p2.title).toBe('Untitled project')
    expect(p2.rank < p1.rank).toBe(true) // newest on top (smaller rank)
  })
})

describe('status & stages', () => {
  it('jumps to any stage', async () => {
    const id = await createProject('P', 'ceramics')
    await setProjectStatus((await db.projects.get(id))!, 'Glazing')
    expect((await db.projects.get(id))!.status).toBe('Glazing')
  })

  it('keeps the current status when it survives a stage edit', async () => {
    const id = await createProject('P', 'kanban') // To do / In progress / Done
    await setProjectStatus((await db.projects.get(id))!, 'In progress')
    await setProjectStages((await db.projects.get(id))!, ['To do', 'In progress', 'Shipped'])
    expect((await db.projects.get(id))!.status).toBe('In progress')
  })

  it('reconciles to the first stage when the current status is removed', async () => {
    const id = await createProject('P', 'kanban')
    await setProjectStatus((await db.projects.get(id))!, 'In progress')
    await setProjectStages((await db.projects.get(id))!, ['Backlog', 'Done'])
    expect((await db.projects.get(id))!.status).toBe('Backlog')
  })
})

describe('details & favourite', () => {
  it('replaces the details blob', async () => {
    const id = await createProject('P', 'kanban')
    await setProjectDetails((await db.projects.get(id))!, { Height: '12 cm' })
    expect((await db.projects.get(id))!.details).toEqual({ Height: '12 cm' })
  })

  it('toggles the favourite flag both ways', async () => {
    const id = await createProject('P', 'kanban')
    await toggleFavourite((await db.projects.get(id))!)
    expect((await db.projects.get(id))!.favourite).toBe(true)
    await toggleFavourite((await db.projects.get(id))!)
    expect((await db.projects.get(id))!.favourite).toBe(false)
  })
})

describe('collections', () => {
  it('creates, assigns, and renames', async () => {
    const pid = await createProject('P', 'kanban')
    const cid = await createCollection('Ceramics')
    await setProjectCollection((await db.projects.get(pid))!, cid)
    expect((await db.projects.get(pid))!.collection_id).toBe(cid)

    await renameCollection((await db.collections.get(cid))!, 'Pottery')
    expect((await db.collections.get(cid))!.name).toBe('Pottery')
    expect((await allCollections()).map((c) => c.name)).toEqual(['Pottery'])
  })

  it('detaches member projects when a collection is deleted', async () => {
    const pid = await createProject('P', 'kanban')
    const cid = await createCollection('Textiles')
    await setProjectCollection((await db.projects.get(pid))!, cid)

    await deleteCollection(cid)
    expect((await db.collections.get(cid))!.deleted).toBe(true)
    expect((await db.projects.get(pid))!.collection_id).toBeNull()
    expect(await allCollections()).toHaveLength(0)
  })
})

describe('deleteProject', () => {
  it('tombstones the project and cascades to its project-scoped ideas + attachments', async () => {
    // A promoted idea lives inside the project; give it a photo attachment.
    const ideaId = (await captureIdea({ text: 'thin rims', link: '', photo: null }, null))!
    const pid = await promoteIdea((await db.ideas.get(ideaId))!, 'Cups', 'ceramics')
    await writeLocal('attachments', {
      id: crypto.randomUUID(),
      owner_type: 'idea',
      owner_id: ideaId,
      storage_key: null,
      content_type: 'image/png',
      uploaded: false,
    })

    await deleteProject(pid)

    expect((await db.projects.get(pid))!.deleted).toBe(true)
    expect((await db.ideas.get(ideaId))!.deleted).toBe(true)
    const atts = await db.attachments.where('owner_id').equals(ideaId).toArray()
    expect(atts.every((a) => a.deleted)).toBe(true)
  })
})

describe('projectIdeaPhotos', () => {
  it('returns the promoted idea photos for the project, oldest first', async () => {
    const ideaId = (await captureIdea({ text: 'thin rims', link: '', photo: null }, null))!
    const pid = await promoteIdea((await db.ideas.get(ideaId))!, 'Cups', 'ceramics')
    const older = crypto.randomUUID()
    const newer = crypto.randomUUID()
    await writeLocal('attachments', {
      id: older, owner_type: 'idea', owner_id: ideaId, storage_key: null,
      content_type: 'image/png', uploaded: true, created_at: '2026-01-01T00:00:00Z',
    })
    await writeLocal('attachments', {
      id: newer, owner_type: 'idea', owner_id: ideaId, storage_key: null,
      content_type: 'image/png', uploaded: true, created_at: '2026-02-01T00:00:00Z',
    })

    const photos = await projectIdeaPhotos(pid)
    expect(photos.map((p) => p.id)).toEqual([older, newer])
  })

  it('excludes captured (inbox) ideas, deleted attachments, and item photos', async () => {
    const ideaId = (await captureIdea({ text: 'x', link: '', photo: null }, null))!
    const pid = await promoteIdea((await db.ideas.get(ideaId))!, 'P', 'ceramics')
    // A captured idea sitting in the project inbox — not a founding image.
    const captured = (await captureIdea({ text: 'later', link: '', photo: null }, pid))!
    await writeLocal('attachments', {
      id: crypto.randomUUID(), owner_type: 'idea', owner_id: captured, storage_key: null,
      content_type: 'image/png', uploaded: false,
    })
    // A deleted attachment on the promoted idea.
    const gone = crypto.randomUUID()
    await writeLocal('attachments', {
      id: gone, owner_type: 'idea', owner_id: ideaId, storage_key: null,
      content_type: 'image/png', uploaded: false,
    })
    await deleteLocal('attachments', gone)

    expect(await projectIdeaPhotos(pid)).toEqual([])
  })
})

describe('loadProjectCards', () => {
  it('pins favourites on top, then orders by rank', async () => {
    const a = await createProject('A', 'kanban') // newest-on-top ranking
    const b = await createProject('B', 'kanban')
    await toggleFavourite((await db.projects.get(a))!) // favourite the older one

    const cards = await loadProjectCards()
    expect(cards.map((c) => c.project.id)).toEqual([a, b])
  })

  it('surfaces the project latest photo and excludes deleted projects', async () => {
    const ideaId = (await captureIdea({ text: 'x', link: '', photo: null }, null))!
    const pid = await promoteIdea((await db.ideas.get(ideaId))!, 'P', 'ceramics')
    const attId = crypto.randomUUID()
    await writeLocal('attachments', {
      id: attId,
      owner_type: 'idea',
      owner_id: ideaId,
      storage_key: null,
      content_type: 'image/png',
      uploaded: false,
    })

    const cards = await loadProjectCards()
    const card = cards.find((c) => c.project.id === pid)!
    expect(card.cover).toEqual({ kind: 'attachment', id: attId, uploaded: false })

    await deleteProject(pid)
    expect((await loadProjectCards()).find((c) => c.project.id === pid)).toBeUndefined()
  })
})
