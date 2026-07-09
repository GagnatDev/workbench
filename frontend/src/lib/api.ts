const base = import.meta.env.VITE_API_URL ?? ''

/** The authenticated app user, as returned by GET /api/me. */
export interface AppUser {
  id: string
  email: string | null
  displayName: string | null
  role: string | null
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Same-origin fetch. The auth-proxy sidecar owns authentication end-to-end: it
 * gates the top-level navigation, refreshes tokens in-cluster, and injects the
 * identity the backend reads — so the SPA holds no token and attaches no
 * Authorization header. The browser's `hs_session` cookie rides along same-origin
 * automatically (default credentials).
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, init)
}

export async function getMe(): Promise<AppUser> {
  const res = await apiFetch('/api/me')
  if (!res.ok) throw new ApiError(res.status, 'Failed to load profile')
  return (await res.json()) as AppUser
}

/**
 * Permanently delete the caller's account and all data linked to it (every
 * content row plus their stored photos). The session is dead afterwards, so the
 * caller should log out / redirect on success.
 */
export async function deleteAccount(): Promise<void> {
  const res = await apiFetch('/api/account', { method: 'DELETE' })
  if (!res.ok) throw new ApiError(res.status, 'Failed to delete account')
}

/**
 * Invite a friend to Workbench (Phase 6 stretch). The backend forwards to the
 * auth service, which decides whether the caller may invite. Returns whatever the
 * auth service hands back; we surface a link if one is present.
 */
export async function sendInvite(email: string): Promise<{ inviteUrl?: string }> {
  const res = await apiFetch('/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    inviteUrl?: string
    url?: string
    link?: string
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Invite failed')
  return { inviteUrl: data.inviteUrl ?? data.url ?? data.link }
}
