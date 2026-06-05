import en from './locales/en/translation.json'
import nb from './locales/nb/translation.json'

/** The one namespace ("translation", the i18next default) per locale. */
export const resources = {
  nb: { translation: nb },
  en: { translation: en },
} as const

export type AppLocale = keyof typeof resources
export const SUPPORTED_LOCALES: AppLocale[] = ['nb', 'en']
