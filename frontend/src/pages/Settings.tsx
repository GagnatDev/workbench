import { useAuth } from '@/auth/AuthContext'

/** Settings / profile (ui-ux-design.md §12, screen #19). Phase 1: identity + sign-out. */
export function Settings() {
  const { user, logout, authDisabled } = useAuth()

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-serif text-2xl text-charcoal">Settings</h2>

      <div className="rounded-card bg-stoneware p-4">
        <p className="text-sm text-charcoal-muted">Signed in as</p>
        <p className="text-charcoal">{user?.email ?? 'Unknown'}</p>
        {user?.role && (
          <p className="mt-1 text-sm text-charcoal-muted">Role: {user.role}</p>
        )}
        {authDisabled && (
          <p className="mt-2 text-sm text-flax">Dev mode — auth bypassed</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="self-start rounded-lg border border-divider px-4 py-2 text-charcoal hover:bg-stoneware"
      >
        Sign out
      </button>
    </section>
  )
}
