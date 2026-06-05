import { useEffect, useRef, useState } from 'react'
import { SyncDot } from './SyncDot'
import { syncEngine } from '@/db/sync'
import { useSyncState } from '@/db/useSyncState'

/**
 * Header sync control (ui-ux-design.md §9.1): the calm status dot, tappable for a
 * small panel showing what's pending ("3 changes · 2 photos queued") and a manual
 * **Sync now**. Calm by default, inspectable when you care — and never a blocking
 * banner (the workshop *is* the offline place). The dot itself stays presentational
 * (SyncDot); this wraps it with the popover and wires the manual trigger.
 */
export function SyncStatus() {
  const sync = useSyncState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Dismiss the popover on an outside click (it's a transient inspector).
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const STATUS_LABEL = {
    synced: 'Synced',
    syncing: 'Syncing…',
    offline: 'Offline',
    error: 'Sync error',
  } as const

  const parts: string[] = []
  if (sync.pending > 0) parts.push(`${sync.pending} ${sync.pending === 1 ? 'change' : 'changes'}`)
  if (sync.photosQueued > 0) parts.push(`${sync.photosQueued} queued`)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Sync status"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center"
      >
        <SyncDot state={sync.status} pending={sync.pending} photos={sync.photosQueued} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-card bg-stoneware p-3 shadow-md">
          <p className="text-sm font-medium text-charcoal">{STATUS_LABEL[sync.status]}</p>
          <p className="mt-0.5 text-sm text-charcoal-muted">
            {parts.length ? parts.join(' · ') : 'Everything is up to date.'}
          </p>
          <button
            type="button"
            onClick={() => {
              void syncEngine.syncNow()
            }}
            disabled={sync.status === 'syncing'}
            className="mt-3 w-full rounded-lg bg-terracotta py-2 text-sm text-oatmeal disabled:opacity-50"
          >
            {sync.status === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      )}
    </div>
  )
}
