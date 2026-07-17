import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'
import { navigateForLogin } from '@/lib/session'

/**
 * Gate the app shell on the session check. The auth-proxy sidecar is the real
 * gate — an unauthenticated top-level navigation never reaches the SPA — so
 * this covers the brief `GET /api/me` check on load and a session that lapses
 * mid-use. An expired session usually recovers on its own via a silent,
 * place-preserving page load (lib/session.ts); the manual screen below only
 * appears when that bounded re-auth is exhausted.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const { t } = useTranslation()

  if (status === 'expired') {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 pt-16 text-center">
        <p className="text-sm text-charcoal-muted">{t('auth.session_expired')}</p>
        {/*
          Must go through navigateForLogin, not window.location.reload(): a plain
          reload is answered by the PWA service worker from precache and never
          reaches the sidecar, so the login redirect can't run and the button
          would just re-render this screen in a loop. navigateForLogin
          unregisters the worker first.
        */}
        <button
          type="button"
          onClick={() => void navigateForLogin()}
          className="rounded-lg bg-terracotta px-4 py-2 text-sm text-oatmeal"
        >
          {t('auth.sign_in_again')}
        </button>
      </div>
    )
  }

  if (status !== 'ready') {
    // Covers 'loading' and 'reauthenticating' — in the latter case a silent
    // re-auth page load is about to replace this document anyway.
    return (
      <div
        className="flex h-full items-center justify-center text-charcoal-muted"
        role="status"
        aria-live="polite"
      >
        {t('common.loading')}
      </div>
    )
  }

  return <>{children}</>
}
