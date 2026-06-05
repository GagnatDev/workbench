import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { FolderOpen, Inbox, Plus, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncEngine } from '@/db/sync'
import { SyncStatus } from './SyncStatus'
import { CaptureSheet } from './CaptureSheet'

const NAV = [
  { to: '/inbox', labelKey: 'nav.inbox', icon: Inbox },
  { to: '/projects', labelKey: 'nav.projects', icon: FolderOpen },
] as const

function navItemClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex flex-col items-center gap-0.5 text-xs transition-colors',
    isActive ? 'text-terracotta' : 'text-charcoal-muted hover:text-charcoal',
  )
}

/**
 * App shell: header (title · sync dot · avatar) + the three-zone navigation
 * (Inbox · ➕ · Projects). Bottom bar on phones; slim left rail at ≥768px — same
 * component tree, one breakpoint (ui-ux-design.md §1, §10).
 */
export function AppLayout() {
  const { t } = useTranslation()
  const [capturing, setCapturing] = useState(false)
  // Capture is context-aware: anywhere under a project, the default destination is
  // that project's inbox; elsewhere it's the global inbox (ui-ux-design.md §2).
  const projectMatch = useMatch({ path: '/projects/:id', end: false })
  const currentProjectId = projectMatch?.params.id ?? null

  // The authed shell is the right place to start the engine: it mounts only once
  // the user is authenticated (so authedFetch has a token) and stays mounted for
  // the session. start() kicks off the first sync and wires focus/reconnect.
  useEffect(() => syncEngine.start(), [])

  const captureButton = (
    <button
      type="button"
      aria-label={t('nav.capture_aria')}
      onClick={() => setCapturing(true)}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-oatmeal shadow-md transition-transform active:scale-95"
    >
      <Plus size={26} />
    </button>
  )

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left rail (desktop) */}
      <nav className="hidden border-r border-divider bg-oatmeal px-3 py-6 md:flex md:flex-col md:items-center md:gap-8">
        {NAV.map(({ to, labelKey, icon: Icon }) => (
          <NavLink key={to} to={to} className={navItemClass} aria-label={t(labelKey)}>
            <Icon size={24} />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
        {captureButton}
      </nav>

      {/* Main column */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-divider px-4 py-3">
          <h1 className="font-serif text-xl text-charcoal">{t('app.title')}</h1>
          <div className="flex items-center gap-4">
            <SyncStatus />
            <NavLink
              to="/settings"
              aria-label={t('nav.settings_aria')}
              className="text-charcoal-muted hover:text-charcoal"
            >
              <User size={22} />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto px-4 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Bottom bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-divider bg-oatmeal px-6 py-2 md:hidden">
        <NavLink to="/inbox" className={navItemClass} aria-label={t('nav.inbox')}>
          <Inbox size={24} />
          <span>{t('nav.inbox')}</span>
        </NavLink>
        <div className="-mt-6">{captureButton}</div>
        <NavLink to="/projects" className={navItemClass} aria-label={t('nav.projects')}>
          <FolderOpen size={24} />
          <span>{t('nav.projects')}</span>
        </NavLink>
      </nav>

      {capturing && (
        <CaptureSheet defaultProjectId={currentProjectId} onClose={() => setCapturing(false)} />
      )}
    </div>
  )
}
