import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Route the engine's authed calls (presign / push / pull) at an in-memory server.
const authedFetch = vi.fn()
vi.mock('@/auth/authClient', () => ({
  authClient: {
    authedFetch: (...args: unknown[]) => authedFetch(...args),
    getAccessToken: () => 'test-token',
    disabled: true,
  },
}))

const { db } = await import('./db')
const { syncEngine, writeLocal } = await import('./sync')
const { captureIdea, promoteIdea } = await import('./ideas')
const { SYNC_TABLES } = await import('./types')
const i18n = (await import('@/i18n')).default

type Row = Record<string, unknown> & { id: string; updated_at: string }
let server: Record<string, Row[]>
let putUrls: string[]

function resp(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

beforeEach(async () => {
  // Template seeds are localized (Norwegian-first); pin English so the
  // promote-into-project assertions below stay deterministic.
  await i18n.changeLanguage('en')
  server = {}
  putUrls = []
  authedFetch.mockReset()
  authedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
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
  })

  // The S3 PUT is a plain fetch (presigned URL); capture its calls.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      putUrls.push(String(url))
      return { ok: true, status: 200 } as Response
    }),
  )

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
    authedFetch.mockReset()
    authedFetch.mockRejectedValue(new TypeError('Failed to fetch'))
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
    authedFetch.mockReset()
    authedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
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

    const presignCalls = authedFetch.mock.calls.filter((c) =>
      String(c[0]).includes('/api/uploads/presign'),
    )
    expect(presignCalls).toHaveLength(1)
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect((await db.attachments.get(attId))?.uploaded).toBe(false)
    expect(syncEngine.getState().status).toBe('synced') // data still syncs
    expect(syncEngine.getState().photosQueued).toBe(1)
  })

  it('keeps the photo queued when upload fails (data sync still completes)', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      return { ok: false, status: 503 } as Response
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
