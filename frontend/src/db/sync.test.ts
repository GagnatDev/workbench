import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine makes plain same-origin fetches now (the sidecar authenticates
// them); back that fetch with a tiny in-memory LWW server.
const fetchMock = vi.fn()

const { db } = await import('./db')
const { syncEngine, writeLocal, deleteLocal } = await import('./sync')
const { SYNC_TABLES } = await import('./types')

/** A tiny stateful LWW server backing the fetch mock. */
type Row = Record<string, unknown> & { id: string; updated_at: string }
let server: Record<string, Row[]>

function resp(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function installServer(): void {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/sync/push')) {
      const { changes } = JSON.parse(String(init?.body)) as {
        changes: Record<string, Row[]>
      }
      const applied: Record<string, Row[]> = {}
      for (const [table, rows] of Object.entries(changes)) {
        server[table] ??= []
        applied[table] = []
        for (const row of rows) {
          // Server forces user_id and re-stamps updated_at, echoes the truth back.
          const stored: Row = {
            ...row,
            user_id: 'u1',
            updated_at: new Date().toISOString(),
            deleted: row.deleted ?? false,
          }
          const idx = server[table].findIndex((r) => r.id === row.id)
          if (idx >= 0) server[table][idx] = stored
          else server[table].push(stored)
          applied[table].push(stored)
        }
      }
      return resp({ serverTime: new Date().toISOString(), applied })
    }
    // pull: return the whole server state (cursor logic is exercised server-side).
    return resp({ serverTime: new Date().toISOString(), changes: { ...server } })
  })
}

beforeEach(async () => {
  server = {}
  fetchMock.mockReset()
  installServer()
  vi.stubGlobal('fetch', fetchMock)
  // Stop the debounce from firing real timers between tests.
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()))
  await db._meta.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('writeLocal', () => {
  it('stamps the envelope and marks the row dirty', async () => {
    const id = await writeLocal('collections', { name: 'Mugs', rank: 'a0' })
    const row = await db.collections.get(id)
    expect(row).toMatchObject({ name: 'Mugs', rank: 'a0', _dirty: 1, deleted: false })
    expect(row?.created_at).toBeDefined()
    expect(row?.updated_at).toBeDefined()
  })
})

describe('push', () => {
  it('sends dirty rows (without _dirty) and clears the flag on success', async () => {
    await writeLocal('collections', { name: 'Mugs', rank: 'a0' })
    await syncEngine.syncNow()

    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(sent.changes.collections[0]).not.toHaveProperty('_dirty')

    const rows = await db.collections.toArray()
    expect(rows[0]._dirty).toBe(0)
    expect(server.collections).toHaveLength(1)
    expect(syncEngine.getState().status).toBe('synced')
    expect(syncEngine.getState().pending).toBe(0)
  })
})

describe('pull', () => {
  it('merges a remote row into the local store', async () => {
    server.projects = [
      {
        id: crypto.randomUUID(),
        user_id: 'u1',
        title: 'Remote vase',
        stages: [],
        details: {},
        favourite: false,
        rank: 'a0',
        updated_at: new Date().toISOString(),
        deleted: false,
      },
    ]
    await syncEngine.syncNow()

    const local = await db.projects.toArray()
    expect(local).toHaveLength(1)
    expect(local[0]).toMatchObject({ title: 'Remote vase', _dirty: 0 })
  })

  it('keeps tombstones so deletions propagate', async () => {
    const id = crypto.randomUUID()
    server.ideas = [
      {
        id,
        user_id: 'u1',
        content: 'gone',
        state: 'captured',
        tags: [],
        updated_at: new Date().toISOString(),
        deleted: true,
      },
    ]
    await syncEngine.syncNow()

    const row = await db.ideas.get(id)
    expect(row).toMatchObject({ id, deleted: true })
  })

  it('advances the cursor to the server time', async () => {
    await syncEngine.syncNow()
    const cursor = await db._meta.get('syncCursor')
    expect(cursor?.value).toBeDefined()
    expect(Date.parse(cursor!.value)).not.toBeNaN()
  })
})

describe('deleteLocal', () => {
  it('writes a tombstone and marks it dirty', async () => {
    const id = await writeLocal('collections', { name: 'Temp', rank: 'a0' })
    await deleteLocal('collections', id)
    const row = await db.collections.get(id)
    expect(row).toMatchObject({ deleted: true, _dirty: 1 })
  })
})

describe('round-trip', () => {
  it('a pushed row survives a subsequent pull (no duplication, stays clean)', async () => {
    await writeLocal('collections', { name: 'Mugs', rank: 'a0' })
    await syncEngine.syncNow()
    await syncEngine.syncNow()

    const rows = await db.collections.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]._dirty).toBe(0)
  })
})
