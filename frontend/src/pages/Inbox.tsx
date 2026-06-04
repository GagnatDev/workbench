import { EmptyState } from '@/components/EmptyState'

/**
 * Global Inbox (ui-ux-design.md §3). Phase 1 shows the New/Kept scaffold and the
 * inbox-zero empty state; capture, triage (swipe), and promote arrive in Phase 3.
 */
export function Inbox() {
  return (
    <section>
      <div className="mb-6 flex gap-6 border-b border-divider text-sm">
        <span className="border-b-2 border-terracotta pb-2 font-medium text-charcoal">
          New
        </span>
        <span className="pb-2 text-charcoal-muted">Kept</span>
      </div>
      <EmptyState title="Tap ➕ to capture your first idea." />
    </section>
  )
}
