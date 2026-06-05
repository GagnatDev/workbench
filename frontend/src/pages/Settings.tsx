import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { setLanguage } from '@/i18n'
import { SUPPORTED_LOCALES } from '@/i18n/resources'
import { ApiError, sendInvite } from '@/lib/api'

/** Settings / profile (ui-ux-design.md §12, screen #19): identity, sign-out, and
 * the optional "Invite a friend" flow (Phase 6) for admins. */
export function Settings() {
  const { t } = useTranslation()
  const { user, logout, authDisabled } = useAuth()

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-serif text-2xl text-charcoal">{t('settings.title')}</h2>

      <div className="rounded-card bg-stoneware p-4">
        <p className="text-sm text-charcoal-muted">{t('settings.signed_in_as')}</p>
        <p className="text-charcoal">{user?.email ?? t('settings.unknown')}</p>
        {user?.role && (
          <p className="mt-1 text-sm text-charcoal-muted">{t('settings.role', { role: user.role })}</p>
        )}
        {authDisabled && (
          <p className="mt-2 text-sm text-flax">{t('settings.dev_mode')}</p>
        )}
      </div>

      <LanguageCard />

      {!authDisabled && <InviteCard />}

      <button
        type="button"
        onClick={() => void logout()}
        className="self-start rounded-lg border border-divider px-4 py-2 text-charcoal hover:bg-stoneware"
      >
        {t('settings.sign_out')}
      </button>
    </section>
  )
}

/** Language switcher (Norwegian-first; the choice persists in localStorage). */
function LanguageCard() {
  const { t, i18n } = useTranslation()

  return (
    <div className="rounded-card bg-stoneware p-4">
      <p className="font-serif text-lg text-charcoal">{t('settings.language.title')}</p>
      <div className="mt-3 flex gap-2">
        {SUPPORTED_LOCALES.map((lng) => {
          const active = i18n.language === lng
          return (
            <button
              key={lng}
              type="button"
              aria-pressed={active}
              onClick={() => setLanguage(lng)}
              className={
                active
                  ? 'rounded-lg bg-terracotta px-4 py-2 text-sm text-oatmeal'
                  : 'rounded-lg bg-oatmeal px-4 py-2 text-sm text-charcoal hover:bg-oatmeal/70'
              }
            >
              {t(`settings.language.${lng}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Invite a friend: forwards to the auth service, which gates who may invite. */
function InviteCard() {
  const { t } = useTranslation()
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
      setError(err instanceof ApiError ? err.message : t('settings.invite.error'))
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
      <p className="font-serif text-lg text-charcoal">{t('settings.invite.title')}</p>
      <p className="mt-0.5 text-sm text-charcoal-muted">{t('settings.invite.subtitle')}</p>
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
          placeholder={t('settings.invite.email_placeholder')}
          className="min-w-0 flex-1 rounded-lg bg-oatmeal p-2.5 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !email.trim()}
          className="flex-shrink-0 rounded-lg bg-terracotta px-4 py-2.5 text-sm text-oatmeal disabled:opacity-50"
        >
          {sending ? t('settings.invite.sending') : t('settings.invite.send')}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-brick">{error}</p>}
      {sent && !link && <p className="mt-2 text-sm text-olive">{t('settings.invite.sent')}</p>}
      {link && (
        <div className="mt-3">
          <p className="text-sm text-olive">{t('settings.invite.created')}</p>
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
