import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'

/**
 * Gate the app shell on an established session. The auth-proxy sidecar is the
 * real gate — an unauthenticated top-level navigation never reaches the SPA — so
 * this mostly covers the brief `GET /api/me` check on load and a session that
 * lapses mid-use. On `unauthenticated` we do a full page load to `/` so the
 * sidecar can run the central-login redirect (client-side routing can't).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const { t } = useTranslation()

  useEffect(() => {
    if (status === 'unauthenticated') window.location.href = '/'
  }, [status])

  if (status !== 'authenticated') {
    return (
      <div className="flex h-full items-center justify-center text-charcoal-muted">
        {t('common.loading')}
      </div>
    )
  }
  return <>{children}</>
}
