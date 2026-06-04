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
