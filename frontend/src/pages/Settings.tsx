import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { ApiError, sendInvite } from '@/lib/api'

/** Settings / profile (ui-ux-design.md §12, screen #19): identity, sign-out, and
 * the optional "Invite a friend" flow (Phase 6) for admins. */
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

      {!authDisabled && <InviteCard />}

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

/** Invite a friend: forwards to the auth service, which gates who may invite. */
function InviteCard() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async () => {
    if (sending || !email.trim()) return
    setSending(true)
    setError(null)
    setLink(null)
    setSent(false)
    try {
      const { inviteUrl } = await sendInvite(email.trim())
      setSent(true)
      setLink(inviteUrl ?? null)
      setEmail('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the invite.')
    } finally {
      setSending(false)
    }
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-card bg-stoneware p-4">
      <p className="font-serif text-lg text-charcoal">Invite a friend</p>
      <p className="mt-0.5 text-sm text-charcoal-muted">
        Workbench is invite-only. Send a friend an invite to join.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="friend@example.com"
          className="min-w-0 flex-1 rounded-lg bg-oatmeal p-2.5 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !email.trim()}
          className="flex-shrink-0 rounded-lg bg-terracotta px-4 py-2.5 text-sm text-oatmeal disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Invite'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-brick">{error}</p>}
      {sent && !link && <p className="mt-2 text-sm text-olive">Invite sent.</p>}
      {link && (
        <div className="mt-3">
          <p className="text-sm text-olive">Invite created — share this link:</p>
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg bg-oatmeal p-2.5 text-left text-sm text-charcoal"
          >
            <span className="min-w-0 flex-1 truncate">{link}</span>
            {copied ? (
              <Check size={16} className="flex-shrink-0 text-olive" />
            ) : (
              <Copy size={16} className="flex-shrink-0 text-charcoal-muted" />
            )}
          </button>
        </div>
      )}
    </div>
  )
}
