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

function describe(state: SyncDotState, pending: number): string {
  const base = STYLES[state].label
  if (pending > 0 && state !== 'syncing') {
    const noun = pending === 1 ? 'change' : 'changes'
    return state === 'offline'
      ? `Offline — ${pending} ${noun} pending`
      : `${base} — ${pending} ${noun} pending`
  }
  return base
}

export function SyncDot({
  state = 'synced',
  pending = 0,
}: {
  state?: SyncDotState
  pending?: number
}) {
  const { className } = STYLES[state]
  const label = describe(state, pending)
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-block h-2.5 w-2.5 rounded-full ${className}`}
    />
  )
}
