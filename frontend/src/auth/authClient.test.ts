import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The auth service rotates the refresh token on every /refresh, so two
 * overlapping refreshes race: one rotation wins, the other sends the now-stale
 * token and 401s (which also clears the cookie). authClient coalesces concurrent
 * refreshes into a single request to avoid this — these tests pin that down.
 */
describe('authClient refresh dedup', () => {
  beforeEach(() => {
    vi.resetModules()
    // AUTH_DISABLED is read at module load; force the real (network) path.
    vi.stubEnv('VITE_DISABLE_AUTH', 'false')
    vi.stubEnv('VITE_AUTH_SERVICE_URL', 'http://auth.test')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('coalesces concurrent refreshes into a single /refresh request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 'tok-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { authClient } = await import('./authClient')

    const results = await Promise.all([
      authClient.bootstrap(),
      authClient.bootstrap(),
      authClient.bootstrap(),
    ])

    expect(results).toEqual(['tok-1', 'tok-1', 'tok-1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('starts a fresh request once the in-flight one has settled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 'tok-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { authClient } = await import('./authClient')

    await authClient.bootstrap()
    await authClient.bootstrap()

    // Dedup is scoped to concurrency, not a permanent cache.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clears the in-flight slot after a failed refresh so retries can proceed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok-2' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { authClient } = await import('./authClient')

    expect(await authClient.bootstrap()).toBeNull()
    expect(await authClient.bootstrap()).toBe('tok-2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

/**
 * Transport selection: with VITE_AUTH_SERVICE_URL set (local `pnpm dev:homectl`)
 * the client talks to the public auth service directly; unset (production) it
 * goes same-origin to the backend gateway, which fronts the auth service over
 * cluster service discovery (backend/src/routes/authGateway.ts).
 */
describe('authClient transport', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_DISABLE_AUTH', 'false')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the direct auth service origin when VITE_AUTH_SERVICE_URL is set', async () => {
    vi.stubEnv('VITE_AUTH_SERVICE_URL', 'http://auth.test')
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 't' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { authClient } = await import('./authClient')

    await authClient.bootstrap()
    await authClient.logout()

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://auth.test/refresh', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://auth.test/logout', expect.anything())
  })

  it('uses the same-origin backend gateway when VITE_AUTH_SERVICE_URL is unset', async () => {
    vi.stubEnv('VITE_AUTH_SERVICE_URL', '')
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 't' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { authClient } = await import('./authClient')

    await authClient.bootstrap()
    await authClient.logout()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/auth/logout', expect.anything())
  })
})
