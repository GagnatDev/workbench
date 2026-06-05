import { authClient } from '@/auth/authClient'

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

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return authClient.authedFetch(`${base}${path}`, init)
}

export async function getMe(): Promise<AppUser> {
  const res = await apiFetch('/api/me')
  if (!res.ok) throw new ApiError(res.status, 'Failed to load profile')
  return (await res.json()) as AppUser
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
