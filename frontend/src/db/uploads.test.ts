import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine makes plain same-origin fetches now (the sidecar authenticates
// them); route presign / push / pull and the direct S3 PUT through one mock.
const fetchMock = vi.fn()

const { db } = await import('./db')
const { syncEngine, writeLocal } = await import('./sync')
const { SYNC_TABLES } = await import('./types')
const i18n = (await import('@/i18n')).default

type Row = Record<string, unknown> & { id: string; updated_at: string }
let server: Record<string, Row[]>
let putUrls: string[]

function resp(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

/** True for the direct browser→S3 PUT (a cross-origin call to the presigned URL). */
const isS3Put = (url: string): boolean => url.startsWith('https://s3.test/')

/** The same-origin API handler (presign / push / pull) shared across tests. */
function apiResponse(url: string, init?: RequestInit): Response {
  if (url.includes('/api/uploads/presign')) {
    const { attachmentId } = JSON.parse(String(init?.body)) as { attachmentId: string }
    return resp({ url: `https://s3.test/put/${attachmentId}`, storageKey: `u1/${attachmentId}` })
  }
  if (url.includes('/api/sync/push')) {
    const { changes } = JSON.parse(String(init?.body)) as { changes: Record<string, Row[]> }
    const applied: Record<string, Row[]> = {}
    for (const [table, rows] of Object.entries(changes)) {
      server[table] ??= []
      applied[table] = []
      for (const row of rows) {
        const stored: Row = { ...row, user_id: 'u1', updated_at: new Date().toISOString() }
        const idx = server[table].findIndex((r) => r.id === row.id)
        if (idx >= 0) server[table][idx] = stored
        else server[table].push(stored)
        applied[table].push(stored)
      }
    }
    return resp({ serverTime: new Date().toISOString(), applied })
  }
  return resp({ serverTime: new Date().toISOString(), changes: { ...server } })
}

beforeEach(async () => {
  // Template seeds are localized (Norwegian-first); pin English so the
  // promote-into-project assertions below stay deterministic.
  await i18n.changeLanguage('en')
  server = {}
  putUrls = []
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (isS3Put(url)) {
      putUrls.push(String(url))
      return { ok: true, status: 200 } as Response
    }
    return apiResponse(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)

  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  // Reset the engine's session flag so a prior test's 503 doesn't disable uploads.
  ;(syncEngine as unknown as { uploadsDisabled: boolean }).uploadsDisabled = false
  await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()))
  await db.blobs.clear()
  await db._meta.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('photo upload pipeline', () => {
  it('uploads a pending blob and marks the attachment uploaded with its key', async () => {
    const attId = crypto.randomUUID()
    await db.blobs.put({ id: attId, blob: new Blob(['x'], { type: 'image/png' }) })
    await writeLocal('attachments', {
      id: attId,
      owner_type: 'idea',
      owner_id: crypto.randomUUID(),
      storage_key: null,
      content_type: 'image/png',
      uploaded: false,
    })

    await syncEngine.syncNow()

    expect(putUrls).toContain(`https://s3.test/put/${attId}`)
    const att = await db.attachments.get(attId)
    expect(att).toMatchObject({ uploaded: true, storage_key: `u1/${attId}` })
    expect(syncEngine.getState().photosQueued).toBe(0)
  })

  it('treats an unreachable server as offline (calm), not an error', async () => {
    // fetch() rejects with a TypeError when it can't reach the server.
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await writeLocal('ideas', {
      id: crypto.randomUUID(),
      content: 'captured offline',
      link: null,
      project_id: null,
      state: 'captured',
      tags: [],
    })
    await syncEngine.syncNow()

    expect(syncEngine.getState().status).toBe('offline')
    expect(syncEngine.getState().pending).toBe(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('stops re-presigning (one calm log) when storage is not configured (503)', async () => {
    // Presign returns 503; everything else (push/pull) behaves normally.
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/uploads/presign')) {
        return { ok: false, status: 503, json: async () => ({}) } as Response
      }
      if (url.includes('/api/sync/push')) {
        const { changes } = JSON.parse(String(init?.body)) as { changes: Record<string, Row[]> }
        for (const [table, rows] of Object.entries(changes)) {
          server[table] ??= []
          for (const row of rows) server[table].push({ ...row, updated_at: new Date().toISOString() })
        }
        return resp({ serverTime: new Date().toISOString(), applied: changes })
      }
      return resp({ serverTime: new Date().toISOString(), changes: { ...server } })
    })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const attId = crypto.randomUUID()
    await db.blobs.put({ id: attId, blob: new Blob(['x'], { type: 'image/png' }) })
    await writeLocal('attachments', {
      id: attId,
      owner_type: 'idea',
      owner_id: crypto.randomUUID(),
      storage_key: null,
      content_type: 'image/png',
      uploaded: false,
    })

    await syncEngine.syncNow()
    await syncEngine.syncNow() // a second run must not re-attempt presign

    const presignCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/uploads/presign'),
    )
    expect(presignCalls).toHaveLength(1)
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect((await db.attachments.get(attId))?.uploaded).toBe(false)
    expect(syncEngine.getState().status).toBe('synced') // data still syncs
    expect(syncEngine.getState().photosQueued).toBe(1)
  })

  it('a CORS-blocked PUT (thrown TypeError) does not abort the run: data syncs, photo stays queued', async () => {
    // Regression: a direct browser→S3 PUT blocked by CORS makes fetch *reject*
    // with a TypeError (not return a non-2xx response). That used to propagate out
    // of uploadPending and abort the whole run, stranding pending data edits behind
    // a false "offline". The data push/pull must still run and settle the run clean.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isS3Put(url)) throw new TypeError('Failed to fetch')
      return apiResponse(url, init)
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const attId = crypto.randomUUID()
    await db.blobs.put({ id: attId, blob: new Blob(['x'], { type: 'image/png' }) })
    await writeLocal('attachments', {
      id: attId,
      owner_type: 'idea',
      owner_id: crypto.randomUUID(),
      storage_key: null,
      content_type: 'image/png',
      uploaded: false,
    })
    // A separate idea must still reach the server despite the blocked photo PUT.
    await writeLocal('ideas', {
      id: crypto.randomUUID(),
      content: 'still syncs despite CORS-blocked photo',
      link: null,
      project_id: null,
      state: 'captured',
      tags: [],
    })

    await syncEngine.syncNow()

    // Data pushed and the run settled clean — not the false "offline".
    expect(server.ideas).toHaveLength(1)
    expect(syncEngine.getState().status).toBe('synced')
    // The photo stays queued for a later retry; a blocked PUT isn't a logged error.
    expect((await db.attachments.get(attId))?.uploaded).toBe(false)
    expect(syncEngine.getState().photosQueued).toBe(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('keeps the photo queued when upload fails (data sync still completes)', async () => {
    // The S3 PUT fails (non-2xx); presign / push / pull still succeed.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isS3Put(url)) return { ok: false, status: 503 } as Response
      return apiResponse(url, init)
    })
    const attId = crypto.randomUUID()
    await db.blobs.put({ id: attId, blob: new Blob(['x'], { type: 'image/png' }) })
    await writeLocal('attachments', {
      id: attId,
      owner_type: 'idea',
      owner_id: crypto.randomUUID(),
      storage_key: null,
      content_type: 'image/png',
      uploaded: false,
    })
    // A separate idea must still sync despite the photo failing.
    await writeLocal('ideas', {
      id: crypto.randomUUID(),
      content: 'still syncs',
      link: null,
      project_id: null,
      state: 'captured',
      tags: [],
    })

    await syncEngine.syncNow()

    expect((await db.attachments.get(attId))?.uploaded).toBe(false)
    expect(server.ideas).toHaveLength(1)
    expect(syncEngine.getState().status).toBe('synced')
  })
})
