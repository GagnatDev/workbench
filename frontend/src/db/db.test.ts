import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

const { db, wipeLocalDb } = await import('./db')

describe('wipeLocalDb', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('empties every table including blobs and the sync cursor', async () => {
    await db.collections.put({ id: 'c1', name: 'C', rank: 'a', updated_at: '1', _dirty: 1 } as never)
    await db.projects.put({ id: 'p1', title: 'P', rank: 'a', updated_at: '1', _dirty: 1 } as never)
    await db.ideas.put({ id: 'i1', content: 'x', state: 'captured', updated_at: '1', _dirty: 1 } as never)
    await db.blobs.put({ id: 'b1', blob: new Blob(['x']), content_type: 'image/png' } as never)
    await db._meta.put({ key: 'cursor', value: '2024-01-01T00:00:00Z' })

    await wipeLocalDb()

    for (const table of db.tables) {
      expect(await table.count()).toBe(0)
    }
  })

  it('is a no-op on an already-empty database', async () => {
    await expect(wipeLocalDb()).resolves.toBeUndefined()
  })
})
