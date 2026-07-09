import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'

/**
 * OAuth callback landing page. Login is SPA-initiated (authClient.login redirects
 * the browser straight to the auth service's /authorize), so the callback is
 * handled here rather than by the backend client lib.
 *
 * The auth service has already set the session/refresh cookie on its own origin
 * during /login, so the callback's only jobs are:
 *   1. Validate the returned CSRF `state` against the value login() stashed in
 *      sessionStorage. A mismatch means the redirect wasn't ours -> back to login.
 *   2. Hand off to the normal bootstrap path. The full-page return navigation
 *      re-mounts AuthProvider, whose bootstrap() trades the cookie for an access
 *      token; we just wait for that to resolve, then route into the app.
 *
 * There is no `code`/`/token` exchange here: in this SPA topology the cookie,
 * not the authorization code, is what authenticates the browser.
 */
export function Callback() {
  const [params] = useSearchParams()
  const { status } = useAuth()
  const { t } = useTranslation()

  const returnedState = params.get('state')

  // CSRF check, exactly once: compare the returned state to the nonce we stashed
  // before the redirect, then consume the nonce. Done in an effect (not a render
  // path) because it mutates sessionStorage; the ref guards against re-running —
  // StrictMode double-invokes effects in dev, and the second run would see the
  // already-consumed nonce and wrongly compute invalid. `null` = not yet checked.
  const [stateValid, setStateValid] = useState<boolean | null>(null)
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    const expected = sessionStorage.getItem('auth_state')
    sessionStorage.removeItem('auth_state')
    setStateValid(returnedState !== null && returnedState === expected)
  }, [returnedState])

  if (stateValid === false) return <Navigate to="/login" replace />
  if (stateValid === true) {
    if (status === 'authenticated') return <Navigate to="/inbox" replace />
    if (status === 'unauthenticated') return <Navigate to="/login" replace />
  }

  // Still checking the nonce, or waiting on bootstrap to resolve.
  return (
    <div className="flex h-full items-center justify-center text-charcoal-muted">
      {t('common.loading')}
    </div>
  )
}
