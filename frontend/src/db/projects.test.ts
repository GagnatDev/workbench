import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db ops call writeLocal → schedule a sync; stub the scheduler so these
// stay pure local-store tests (the beforeEach below spies syncEngine.schedule).
const { db } = await import('./db')
const { syncEngine, writeLocal } = await import('./sync')
const {
  createProject,
  setProjectStatus,
  setProjectStages,
  setProjectDetails,
  toggleFavourite,
  deleteProject,
  loadProjectCards,
  updateProject,
  allProjectTags,
} = await import('./projects')
const { createSection } = await import('./sections')
const { createItem, addItemPhoto } = await import('./items')
const { captureIdea, promoteIdea } = await import('./ideas')
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

async function section(projectId: string, kind: 'journal' | 'moodboard' | 'checklist' | 'materials') {
  const id = await createSection(projectId, kind, '')
  return (await db.sections.get(id))!
}

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

  it('cascades through sections, items, and attachments', async () => {
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
