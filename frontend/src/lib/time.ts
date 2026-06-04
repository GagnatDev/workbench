/** Compact relative time ("just now", "5m", "2d", "3w") for card metadata. */
export function timeAgo(iso: string | undefined): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, (Date.now() - then) / 1000)
  if (secs < 45) return 'just now'
  const mins = secs / 60
  if (mins < 60) return `${Math.round(mins)}m`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days < 7) return `${Math.round(days)}d`
  const weeks = days / 7
  if (weeks < 5) return `${Math.round(weeks)}w`
  const months = days / 30
  if (months < 12) return `${Math.round(months)}mo`
  return `${Math.round(days / 365)}y`
}
