import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/AuthContext'

/**
 * Sign-in screen (ui-ux-design.md §9.3): one minimal screen that hands off to the
 * homectl OAuth flow. No onboarding wizard, no demo data.
 */
export function Login() {
  const { t } = useTranslation()
  const { status, login } = useAuth()

  if (status === 'authenticated') return <Navigate to="/inbox" replace />

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <img src="/pwa-icon.svg" alt="" className="h-16 w-16" />
        <h1 className="font-serif text-3xl text-charcoal">Workbench</h1>
      </div>
      <button
        type="button"
        onClick={login}
        className="rounded-lg bg-terracotta px-6 py-3 text-oatmeal shadow-sm transition-transform active:scale-95"
      >
        {t('login.sign_in')}
      </button>
      <p className="text-sm text-charcoal-muted">{t('login.invite_only')}</p>
    </div>
  )
}
