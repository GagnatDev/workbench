import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db ops call writeLocal → schedule a sync; stub the scheduler so these
// stay pure local-store tests (the beforeEach below spies syncEngine.schedule).
const { db } = await import('./db')
const { syncEngine, writeLocal, deleteLocal } = await import('./sync')
const { captureIdea, promoteIdea, fileIdea, projectIdeaPhotos } = await import('./ideas')
const { createProject } = await import('./projects')
const { createSection } = await import('./sections')
const { SYNC_TABLES } = await import('./types')
const i18n = (await import('@/i18n')).default

beforeEach(async () => {
  // Template seeds are localized (Norwegian-first); pin English so the
  // promote-into-project assertions below stay deterministic.
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

describe('captureIdea', () => {
  it('saves a text idea to the global inbox, marked captured + dirty', async () => {
    const id = await captureIdea({ text: 'try ash glaze', link: '', photo: null }, null)
    expect(id).toBeTruthy()
    const idea = await db.ideas.get(id!)
    expect(idea).toMatchObject({
      content: 'try ash glaze',
      project_id: null,
      state: 'captured',
      _dirty: 1,
    })
  })

  it('discards an empty draft', async () => {
    const id = await captureIdea({ text: '   ', link: '', photo: null }, null)
    expect(id).toBeNull()
    expect(await db.ideas.count()).toBe(0)
  })

  it('persists tags supplied on the draft', async () => {
    const id = await captureIdea(
      { text: 'try ash glaze', link: '', photo: null, tags: ['glaze', 'experiment'] },
      null,
    )
    const idea = await db.ideas.get(id!)
    expect(idea!.tags).toEqual(['glaze', 'experiment'])
  })

  it('normalizes draft tags to trimmed lowercase and drops blanks', async () => {
    const id = await captureIdea(
      { text: 'try ash glaze', link: '', photo: null, tags: ['  Glaze ', 'RAKU', '   '] },
      null,
    )
    const idea = await db.ideas.get(id!)
    expect(idea!.tags).toEqual(['glaze', 'raku'])
  })

  it('defaults to no tags when the draft omits them', async () => {
    const id = await captureIdea({ text: 'try ash glaze', link: '', photo: null }, null)
    const idea = await db.ideas.get(id!)
    expect(idea!.tags).toEqual([])
  })

  it('stores a photo as a local blob + an un-uploaded attachment', async () => {
    const photoId = crypto.randomUUID()
    const blob = new Blob(['x'], { type: 'image/png' })
    const id = await captureIdea(
      { text: '', link: '', photo: { id: photoId, blob, url: 'blob:x' } },
      null,
    )
    const att = await db.attachments.get(photoId)
    expect(att).toMatchObject({ owner_type: 'idea', owner_id: id, uploaded: false })
    // The blob is persisted under the attachment id (fake-indexeddb strips the
    // Blob prototype on clone, so we assert the row exists rather than instanceof).
    expect(await db.blobs.get(photoId)).toBeDefined()
  })
})

describe('promoteIdea', () => {
  it('creates a project from the template and reparents the idea', async () => {
    const id = await captureIdea({ text: 'Blue cups\nthin rims', link: '', photo: null }, null)
    const idea = (await db.ideas.get(id!))!
    const projectId = await promoteIdea(idea, 'Blue Cups', 'ceramics')

    const project = await db.projects.get(projectId)
    expect(project).toMatchObject({ title: 'Blue Cups', status: 'Planning', favourite: false })
    expect(project!.stages[0]).toBe('Planning')
    expect(Object.keys(project!.details)).toContain('Clay body')

    const reparented = await db.ideas.get(id!)
    expect(reparented).toMatchObject({ project_id: projectId, state: 'promoted' })
    expect((await db._meta.get('lastTemplate'))?.value).toBe('ceramics')
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

  it("carries a captured link into the kind's text so it survives filing", async () => {
    const pid = await createProject('P', 'kanban')
    const link = 'https://example.com/glaze'
    const capture = async () =>
      (await db.ideas.get((await captureIdea({ text: 'glaze recipe', link, photo: null }, pid))!))!

    const journalItem = (await db.items.get(await fileIdea(await capture(), await section(pid, 'journal'))))!
    expect(journalItem.body).toBe(`glaze recipe\n\n${link}`)

    const checklistItem = (await db.items.get(await fileIdea(await capture(), await section(pid, 'checklist'))))!
    expect(checklistItem.title).toBe(`glaze recipe ${link}`)

    const materialItem = (await db.items.get(await fileIdea(await capture(), await section(pid, 'materials'))))!
    expect(materialItem.title).toBe('glaze recipe')
    expect(materialItem.body).toBe(link)

    const moodboardItem = (await db.items.get(await fileIdea(await capture(), await section(pid, 'moodboard'))))!
    expect(moodboardItem.payload).toEqual({ subtype: 'link', url: link })
  })

  it('files a link-only idea (no text) keeping just the link', async () => {
    const pid = await createProject('P', 'kanban')
    const link = 'https://example.com/only'
    const ideaId = (await captureIdea({ text: '', link, photo: null }, pid))!
    const item = (await db.items.get(await fileIdea((await db.ideas.get(ideaId))!, await section(pid, 'journal'))))!
    expect(item.body).toBe(link)
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
