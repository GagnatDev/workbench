import 'i18next'
import type nb from './locales/nb/translation.json'

/**
 * Typed translation keys: t('nav.inbox') autocompletes and a typo is a compile
 * error. nb is the source of truth (it's the default + fallback, kept complete);
 * en is shape-checked against it by the parity test.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof nb }
  }
}
