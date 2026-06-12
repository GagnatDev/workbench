/**
 * Browser auth client. Mirrors the contract of
 * `@gagnatdev/homectl-auth-client/browser` (bootstrap / getAccessToken /
 * authedFetch / logout) so it can be swapped for the real package once it's
 * installable. Implemented locally for now to keep the frontend buildable
 * without the private GitHub Packages dependency, and to add a dev bypass.
 *
 * Flow: the refresh cookie lives on the auth service domain. `bootstrap()` trades
 * it for a short-lived access token (kept in memory only — never localStorage).
 * `authedFetch` attaches the bearer and re-bootstraps once on 401.
 */

const AUTH_DISABLED = import.meta.env.VITE_DISABLE_AUTH === 'true'
const AUTH_SERVICE_URL =
  import.meta.env.VITE_AUTH_SERVICE_URL ?? 'https://auth.homectl.no'
const CLIENT_ID = 'workbench'

let accessToken: string | null = null

// Coalesce concurrent refreshes into one in-flight request. The auth service
// ROTATES the refresh token on every /refresh (the old one is deleted), so two
// overlapping calls would race: the first rotates and succeeds, the second sends
// the now-invalid token and gets a 401 that also clears the cookie. React
// StrictMode double-invokes AuthProvider's bootstrap effect in dev, which is
// exactly that scenario — and it also guards the real case of two authedFetch
// 401s refreshing at once. Sharing the promise means one rotation, one result.
let inflightRefresh: Promise<string | null> | null = null

export interface AuthBrowserClient {
  /** Seed the in-memory token from the refresh cookie. Returns the token or null. */
  bootstrap(): Promise<string | null>
  getAccessToken(): string | null
  /** fetch() with the bearer attached; re-bootstraps once on 401. */
  authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  /** Redirect to the auth service's hosted login (OAuth authorize). */
  login(): void
  logout(): Promise<void>
  readonly disabled: boolean
}

function refresh(): Promise<string | null> {
  // Reuse an in-flight refresh so concurrent callers don't double-rotate the
  // refresh token (see inflightRefresh above).
  if (inflightRefresh) return inflightRefresh
  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${AUTH_SERVICE_URL}/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = (await res.json()) as { access_token?: string }
      accessToken = data.access_token ?? null
      return accessToken
    } catch {
      return null
    } finally {
      inflightRefresh = null
    }
  })()
  return inflightRefresh
}

export const authClient: AuthBrowserClient = {
  disabled: AUTH_DISABLED,

  async bootstrap() {
    if (AUTH_DISABLED) {
      accessToken = 'dev-token'
      return accessToken
    }
    return refresh()
  },

  getAccessToken() {
    return accessToken
  },

  async authedFetch(input, init = {}) {
    const withAuth = (token: string | null): RequestInit => ({
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    let res = await fetch(input, withAuth(accessToken))
    if (res.status === 401 && !AUTH_DISABLED) {
      const token = await refresh()
      if (token) res = await fetch(input, withAuth(token))
    }
    return res
  },

  login() {
    if (AUTH_DISABLED) return
    const redirectUri = `${window.location.origin}/auth/callback`
    const state = crypto.randomUUID()
    sessionStorage.setItem('auth_state', state)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      state,
    })
    window.location.href = `${AUTH_SERVICE_URL}/authorize?${params.toString()}`
  },

  async logout() {
    accessToken = null
    if (AUTH_DISABLED) return
    try {
      await fetch(`${AUTH_SERVICE_URL}/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // best-effort; token already cleared locally
    }
  },
}
