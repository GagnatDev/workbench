import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBehindAuthSidecar } from './sidecarProbe'

function mockFetchResponse(partial: Partial<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => partial as Response),
  )
}

describe('isBehindAuthSidecar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects the sidecar from an opaque redirect (302 to central login)', async () => {
    mockFetchResponse({ type: 'opaqueredirect', status: 0 })
    await expect(isBehindAuthSidecar()).resolves.toBe(true)
  })

  it('detects the sidecar from a 401/403 answer', async () => {
    mockFetchResponse({ type: 'basic', status: 401 })
    await expect(isBehindAuthSidecar()).resolves.toBe(true)
  })

  it('reports no sidecar when the legacy backend serves the SPA (200)', async () => {
    mockFetchResponse({ type: 'basic', status: 200 })
    await expect(isBehindAuthSidecar()).resolves.toBe(false)
  })

  it('never concludes sidecar from a network error (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(isBehindAuthSidecar()).resolves.toBe(false)
  })

  it('sends an unauthenticated HTML request without following redirects', async () => {
    const fetchMock = vi.fn(async () => ({ type: 'basic', status: 200 }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await isBehindAuthSidecar()
    expect(fetchMock).toHaveBeenCalledWith(
      '/',
      expect.objectContaining({
        redirect: 'manual',
        cache: 'no-store',
        headers: { accept: 'text/html' },
      }),
    )
  })
})
