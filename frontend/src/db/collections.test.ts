import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The db ops call writeLocal → schedule a sync; stub the scheduler so these
// stay pure local-store tests (the beforeEach below spies syncEngine.schedule).
const { db } = await import('./db')
const { syncEngine } = await import('./sync')
const { createProject, setProjectCollection } = await import('./projects')
const { createCollection, renameCollection, deleteCollection, allCollections } = await import(
  './collections'
)
const { SYNC_TABLES } = await import('./types')

beforeEach(async () => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()))
  await db.blobs.clear()
  await db._meta.clear()
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
