import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authClient } from './authClient'
import { isBehindAuthSidecar } from './sidecarProbe'
import { getMe, type AppUser } from '@/lib/api'
import { markAuthenticated, reloadForLogin } from '@/lib/session'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: AppUser | null
  status: AuthStatus
  login: () => void
  logout: () => Promise<void>
  authDisabled: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const token = await authClient.bootstrap()
      if (token) {
        try {
          const me = await getMe()
          if (!cancelled) {
            // A confirmed identity resets the silent re-auth attempt budget
            // (lib/session.ts) so a later expiry gets fresh attempts.
            markAuthenticated()
            setUser(me)
            setStatus('authenticated')
          }
          return
        } catch {
          // fall through to the unauthenticated handling below
        }
      }
      if (cancelled) return
      // Escape hatch for the auth-sidecar migration: if the backend now sits
      // behind the auth-proxy sidecar, this (service-worker-cached) bundle's
      // SPA login flow is gone server-side and routing to /login would strand
      // the installed PWA. Detect that world and hand control to a bounded,
      // SW-bypassing top-level navigation so the sidecar can run the central
      // login redirect and serve the new bundle. Stays in 'loading' — the page
      // is about to be replaced.
      if (!authClient.disabled && (await isBehindAuthSidecar())) {
        if (!cancelled && reloadForLogin()) return
      }
      if (!cancelled) setStatus('unauthenticated')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(() => authClient.login(), [])

  const logout = useCallback(async () => {
    await authClient.logout()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, authDisabled: authClient.disabled }),
    [user, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
