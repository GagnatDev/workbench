import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources, SUPPORTED_LOCALES, type AppLocale } from './resources'

/**
 * App i18n (Norwegian-first). nb is the default and the fallback; en is offered
 * via the Settings switcher. We deliberately do NOT detect the browser language —
 * a Norwegian-first product wants a deterministic default, and the preference is
 * a single persisted choice. Resources are statically imported so they ride in
 * the PWA precache and the app translates fully offline.
 */
export const STORAGE_KEY = 'workbench.lang'

function initialLanguage(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY)
  return SUPPORTED_LOCALES.includes(stored as AppLocale) ? (stored as AppLocale) : 'nb'
}

const initialLng = initialLanguage()

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: 'nb',
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
})

// Keep <html lang> in sync for a11y and correct hyphenation.
document.documentElement.lang = initialLng
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

/** Change language and persist the choice across reloads. */
export function setLanguage(lng: AppLocale): void {
  void i18n.changeLanguage(lng)
  localStorage.setItem(STORAGE_KEY, lng)
}

/** The active locale, narrowed to a supported BCP-47 tag for Intl formatting. */
export function activeLocale(): AppLocale {
  return SUPPORTED_LOCALES.includes(i18n.language as AppLocale) ? (i18n.language as AppLocale) : 'nb'
}

export default i18n
