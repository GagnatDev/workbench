import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, getMe, type AppUser } from '@/lib/api'
import { markAuthenticated, navigateForLogin, onSessionLost, reloadForLogin } from '@/lib/session'

/**
 * - `loading`        — first `GET /api/me` still in flight.
 * - `ready`          — render the app. `user` may still be null when the
 *                      identity could not be fetched (offline) — the local-first
 *                      shell works without it and sync fills it in later.
 * - `reauthenticating` — a silent re-auth page load is in flight; show a quiet
 *                      status instead of flashing the session-expired screen.
 * - `expired`        — silent re-auth is exhausted; show the manual screen.
 */
type AuthStatus = 'loading' | 'ready' | 'reauthenticating' | 'expired'

interface AuthContextValue {
  user: AppUser | null
  status: AuthStatus
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * The SPA is auth-agnostic under the sidecar model: it holds no token and knows
 * nothing about the auth service. The auth-proxy has already established the
 * session before the app loads (it redirects an unauthenticated top-level
 * navigation to central login), so we simply read the current user from
 * `GET /api/me`.
 *
 * A 401 means the session lapsed mid-use. The fix is a top-level navigation
 * that reaches the sidecar — but on an installed PWA that must go through
 * `lib/session.ts`: the service worker answers plain reloads from its precache,
 * so an unbounded `location.href = '/'` never reaches the sidecar and loops
 * forever. A network error is *not* a session loss: offline is the normal case
 * in the workshop, so the app renders and works off the local store.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  const loadUser = useCallback(async (): Promise<void> => {
    try {
      const me = await getMe()
      // A confirmed identity means the session is healthy: reset the silent
      // re-auth attempt budget so a later, unrelated expiry starts fresh.
      markAuthenticated()
      setUser(me)
      setStatus('ready')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Bounded, place-preserving bounce through the sidecar (unregisters the
        // service worker so the navigation actually reaches the network). When
        // the attempt budget is exhausted it emits session-lost instead.
        setStatus(reloadForLogin() ? 'reauthenticating' : 'expired')
        return
      }
      // Network error (offline / server unreachable) or a non-auth HTTP error:
      // never navigate — that would reload-loop an offline PWA. Keep whatever
      // identity we have and let the local-first app carry on.
      setStatus('ready')
    }
  }, [])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  // A data request (sync engine) may exhaust the silent re-auth budget without
  // this provider observing the 401. Surface the manual screen when that happens.
  useEffect(
    () =>
      onSessionLost(() => {
        setUser(null)
        setStatus('expired')
      }),
    [],
  )

  // Proactively re-check the session when the tab regains focus. On mobile the
  // PWA is backgrounded for long stretches and the session often expires while
  // hidden; re-checking on return triggers the silent re-auth *before* the user
  // taps anything, rather than surfacing a mid-action 401.
  const lastCheckRef = useRef(0)
  useEffect(() => {
    const RECHECK_THROTTLE_MS = 5_000
    const recheck = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastCheckRef.current < RECHECK_THROTTLE_MS) return
      lastCheckRef.current = now
      void loadUser()
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [loadUser])

  const logout = useCallback(async () => {
    // The sidecar owns POST /auth/logout: it clears hs_session, and the
    // follow-up navigation lets it redirect to login. That navigation must
    // bypass the service worker (navigateForLogin unregisters it first) or the
    // sidecar never sees it and the cached app just reappears.
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } catch {
      // ignore; navigating away is the important part
    }
    setUser(null)
    await navigateForLogin()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, logout }),
    [user, status, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
