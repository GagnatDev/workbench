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
import { getMe, type AppUser } from '@/lib/api'

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
      if (!token) {
        if (!cancelled) setStatus('unauthenticated')
        return
      }
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
