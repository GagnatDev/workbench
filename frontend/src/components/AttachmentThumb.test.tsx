import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

// Keep these pure local-store/render tests: stub the auth seam (sync imports it)
// and the object-URL API jsdom doesn't implement.
vi.mock('@/auth/authClient', () => ({
  authClient: { authedFetch: vi.fn(), getAccessToken: () => 't', disabled: true },
}))

const { db } = await import('@/db/db')
const { syncEngine } = await import('@/db/sync')
const { AttachmentThumb } = await import('./AttachmentThumb')
await import('@/i18n')

beforeEach(async () => {
  vi.spyOn(syncEngine, 'schedule').mockImplementation(() => {})
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
  await Promise.all(db.tables.map((t) => t.clear()))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function attachment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a1',
    user_id: 'u1',
    owner_type: 'item',
    owner_id: 'i1',
    storage_key: 'u1/a1',
    content_type: 'image/png',
    uploaded: true,
    thumb: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted: false,
    _dirty: 0,
    ...over,
  } as never
}

it('renders the inline thumbnail without fetching the full image', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  await db.attachments.put(attachment({ thumb: 'data:image/webp;base64,THUMB' }))

  render(<AttachmentThumb attachmentId="a1" />)

  const img = (await screen.findByRole('img')) as HTMLImageElement
  expect(img.src).toBe('data:image/webp;base64,THUMB')
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('full variant fetches /api/files once and caches the blob in Dexie', async () => {
  const blob = new Blob(['bytes'], { type: 'image/png' })
  const fetchSpy = vi.fn(async () => ({ ok: true, blob: async () => blob }) as unknown as Response)
  vi.stubGlobal('fetch', fetchSpy)
  await db.attachments.put(attachment()) // uploaded, no thumb, no local blob

  render(<AttachmentThumb attachmentId="a1" variant="full" />)

  // The fetched bytes are cached under the attachment id (fake-indexeddb's
  // structured-clone round-trip loses the Blob brand, so assert the row landed).
  await waitFor(async () => {
    expect(await db.blobs.get('a1')).toBeDefined()
  })
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  expect(fetchSpy).toHaveBeenCalledWith(
    expect.stringContaining('/api/files/a1'),
    expect.objectContaining({ credentials: 'include' }),
  )
  // Renders from the cached blob's object URL, not the raw /api/files endpoint.
  const img = (await screen.findByRole('img')) as HTMLImageElement
  expect(img.src).toBe('blob:mock')
})
