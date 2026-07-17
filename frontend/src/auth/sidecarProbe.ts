/**
 * Detect whether this (possibly service-worker-cached) bundle is now being
 * served from behind the homectl-auth-proxy sidecar.
 *
 * Why this exists: when the backend migrates from the SPA auth client to the
 * auth-proxy sidecar, installed PWAs keep running the old bundle from their
 * service worker's precache. The old bundle's login flow (SPA `/login` page →
 * auth service `/authorize`) can no longer establish a session the sidecar
 * accepts, so without an escape hatch the app is stuck on a login loop until
 * the user deletes and reinstalls the PWA (see homectl-infra
 * docs/pwa-auth-sidecar-gotchas.md).
 *
 * The probe: fetch `/` as an unauthenticated HTML request without following
 * redirects. The sidecar answers with a 302 to central login (an
 * `opaqueredirect` under `redirect: 'manual'`); the legacy backend serves the
 * SPA with a plain 200. A network error means offline / server down — never
 * conclude "sidecar" from that.
 *
 * This is a plain subresource fetch (not a navigation), so the service
 * worker's `navigateFallback` does not answer it from precache — it always
 * reaches the network.
 */
export async function isBehindAuthSidecar(): Promise<boolean> {
  try {
    const res = await fetch('/', {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { accept: 'text/html' },
    })
    return res.type === 'opaqueredirect' || res.status === 401 || res.status === 403
  } catch {
    return false
  }
}
