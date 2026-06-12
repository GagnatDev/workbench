import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Drive the auth status from the test; the real provider/bootstrap is irrelevant
// to the CSRF-state logic under test.
const auth = vi.hoisted(() => ({
  status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated',
}))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ status: auth.status }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

import { Callback } from './Callback'

function renderCallback(url: string, opts: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/callback" element={<Callback />} />
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/inbox" element={<div>INBOX</div>} />
      </Routes>
    </MemoryRouter>
  )
  return render(opts.strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('Callback CSRF state check', () => {
  beforeEach(() => {
    sessionStorage.clear()
    auth.status = 'loading'
  })
  afterEach(() => {
    // This project runs Vitest with globals off, so RTL's auto-cleanup never
    // registers — unmount explicitly or renders accumulate across tests.
    cleanup()
    vi.restoreAllMocks()
  })

  it('routes to /inbox when the returned state matches and the user is authenticated', async () => {
    sessionStorage.setItem('auth_state', 's-123')
    auth.status = 'authenticated'
    renderCallback('/auth/callback?state=s-123')
    expect(await screen.findByText('INBOX')).toBeDefined()
  })

  it('routes to /login when the returned state does not match the stashed nonce', async () => {
    sessionStorage.setItem('auth_state', 's-123')
    auth.status = 'authenticated'
    renderCallback('/auth/callback?state=tampered')
    expect(await screen.findByText('LOGIN')).toBeDefined()
  })

  it('routes to /login when no nonce was stashed (redirect was not ours)', async () => {
    auth.status = 'authenticated'
    renderCallback('/auth/callback?state=s-123')
    expect(await screen.findByText('LOGIN')).toBeDefined()
  })

  it('consumes the nonce so it cannot be replayed', async () => {
    sessionStorage.setItem('auth_state', 's-123')
    auth.status = 'authenticated'
    renderCallback('/auth/callback?state=s-123')
    await screen.findByText('INBOX')
    expect(sessionStorage.getItem('auth_state')).toBeNull()
  })

  // Regression: the check reads-and-clears the nonce, so a second effect run must
  // be guarded. Without the ref guard, StrictMode's dev double-invoke sees the
  // already-consumed nonce on the second pass and wrongly bounces to /login.
  it('still validates under StrictMode double-invocation', async () => {
    sessionStorage.setItem('auth_state', 's-123')
    auth.status = 'authenticated'
    renderCallback('/auth/callback?state=s-123', { strict: true })
    expect(await screen.findByText('INBOX')).toBeDefined()
    expect(screen.queryByText('LOGIN')).toBeNull()
  })
})
