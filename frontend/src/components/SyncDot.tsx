/**
 * Sync status dot (header). Calm by default; tap for detail (ui-ux-design.md §9.1).
 * Phase 1 is a static "synced" placeholder — Phase 2 wires the real states
 * (synced / syncing / offline-pending / error) to the sync engine.
 */
type SyncState = 'synced' | 'syncing' | 'offline' | 'error'

const STYLES: Record<SyncState, { className: string; label: string }> = {
  // olive = synced, terracotta = syncing, charcoal = offline-pending, brick = error
  synced: { className: 'bg-olive', label: 'Synced' },
  syncing: { className: 'bg-terracotta animate-pulse', label: 'Syncing…' },
  offline: { className: 'bg-charcoal-muted', label: 'Offline — changes pending' },
  error: { className: 'bg-brick', label: 'Sync error' },
}

export function SyncDot({ state = 'synced' }: { state?: SyncState }) {
  const { className, label } = STYLES[state]
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-block h-2.5 w-2.5 rounded-full ${className}`}
    />
  )
}
