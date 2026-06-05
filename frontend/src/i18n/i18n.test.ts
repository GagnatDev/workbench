import { describe, expect, it, beforeEach } from 'vitest'
import i18n from './index'
import en from './locales/en/translation.json'
import nb from './locales/nb/translation.json'

/** Flatten a nested resource object to dot-keyed leaves: { "a.b": "x" }. */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

const flatNb = flatten(nb)
const flatEn = flatten(en)

describe('i18n locale parity', () => {
  it('nb and en have the exact same key set (incl. _one/_other plurals)', () => {
    const nbKeys = Object.keys(flatNb).sort()
    const enKeys = Object.keys(flatEn).sort()
    const missingInEn = nbKeys.filter((k) => !(k in flatEn))
    const missingInNb = enKeys.filter((k) => !(k in flatNb))
    expect({ missingInEn, missingInNb }).toEqual({ missingInEn: [], missingInNb: [] })
  })

  it('has no empty values in either locale', () => {
    const emptyNb = Object.entries(flatNb).filter(([, v]) => v.trim() === '')
    const emptyEn = Object.entries(flatEn).filter(([, v]) => v.trim() === '')
    expect({ emptyNb, emptyEn }).toEqual({ emptyNb: [], emptyEn: [] })
  })
})

describe('i18n behaviour', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('nb')
  })

  it('defaults to Norwegian and resolves real strings (not the key)', () => {
    expect(i18n.language).toBe('nb')
    expect(i18n.t('nav.inbox')).toBe('Innboks')
    expect(i18n.t('nav.inbox')).not.toBe('nav.inbox')
  })

  it('switches to English and back', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('nav.inbox')).toBe('Inbox')
    await i18n.changeLanguage('nb')
    expect(i18n.t('nav.inbox')).toBe('Innboks')
  })

  it('pluralizes by count in both locales', async () => {
    expect(i18n.t('sync.pending', { count: 1 })).not.toBe(i18n.t('sync.pending', { count: 2 }))
    await i18n.changeLanguage('en')
    expect(i18n.t('sync.pending', { count: 1 })).toBe('1 change')
    expect(i18n.t('sync.pending', { count: 2 })).toBe('2 changes')
  })

  it('interpolates variables', () => {
    expect(i18n.t('settings.role', { role: 'admin' })).toBe('Rolle: admin')
  })
})
