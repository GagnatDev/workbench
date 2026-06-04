/**
 * Sync status dot (header). Calm by default; the tooltip carries the detail
 * (ui-ux-design.md §9.1). Colors per visual-identity.md: olive = synced,
 * terracotta = syncing, charcoal = offline-pending, brick = error. Driven by the
 * Phase 2 sync engine via the `status`/`pending` props.
 */
export type SyncDotState = 'synced' | 'syncing' | 'offline' | 'error'

const STYLES: Record<SyncDotState, { className: string; label: string }> = {
  synced: { className: 'bg-olive', label: 'Synced' },
  syncing: { className: 'bg-terracotta animate-pulse', label: 'Syncing…' },
  offline: { className: 'bg-charcoal-muted', label: 'Offline' },
  error: { className: 'bg-brick', label: 'Sync error' },
}

function describe(state: SyncDotState, pending: number, photos: number): string {
  const base = STYLES[state].label
  const parts: string[] = []
  if (pending > 0) parts.push(`${pending} ${pending === 1 ? 'change' : 'changes'}`)
  if (photos > 0) parts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'} queued`)
  if (parts.length === 0 || state === 'syncing') return base
  const prefix = state === 'offline' ? 'Offline' : base
  return `${prefix} — ${parts.join(' · ')}`
}

export function SyncDot({
  state = 'synced',
  pending = 0,
  photos = 0,
}: {
  state?: SyncDotState
  pending?: number
  photos?: number
}) {
  const { className } = STYLES[state]
  const label = describe(state, pending, photos)
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-block h-2.5 w-2.5 rounded-full ${className}`}
    />
  )
}
