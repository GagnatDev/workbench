import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getMe, type AppUser } from '@/lib/api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

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
 * `GET /api/me`. A 401 means the session lapsed mid-use — bounce through a full
 * page load so the sidecar can run the login redirect for us.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await getMe()
        if (!cancelled) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) setStatus('unauthenticated')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const logout = useCallback(async () => {
    // The sidecar owns POST /auth/logout: it clears hs_session and the reload
    // then hits the login redirect. Best-effort — clear local state regardless.
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } catch {
      // ignore; the reload below re-authenticates anyway
    }
    setUser(null)
    setStatus('unauthenticated')
    window.location.href = '/'
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
