import i18n from '@/i18n'

/**
 * Compact relative time ("just now", "5m", "2d", "3w") for card metadata. The
 * "just now" string and the unit suffixes are localized (time.* keys). Reads the
 * i18n singleton rather than taking `t`, so the many call sites stay unchanged;
 * relative timestamps re-render on data change, so a language switch reflects on
 * the next render rather than instantly — acceptable for card metadata.
 */
export function timeAgo(iso: string | undefined): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, (Date.now() - then) / 1000)
  if (secs < 45) return i18n.t('time.just_now')
  const mins = secs / 60
  if (mins < 60) return i18n.t('time.min', { n: Math.round(mins) })
  const hours = mins / 60
  if (hours < 24) return i18n.t('time.hour', { n: Math.round(hours) })
  const days = hours / 24
  if (days < 7) return i18n.t('time.day', { n: Math.round(days) })
  const weeks = days / 7
  if (weeks < 5) return i18n.t('time.week', { n: Math.round(weeks) })
  const months = days / 30
  if (months < 12) return i18n.t('time.month', { n: Math.round(months) })
  return i18n.t('time.year', { n: Math.round(days / 365) })
}
