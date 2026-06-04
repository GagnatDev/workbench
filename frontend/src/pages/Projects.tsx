import { EmptyState } from '@/components/EmptyState'

/**
 * Projects tab (ui-ux-design.md §5). Phase 1 shows the empty state; the card list,
 * collection filter chips, and favourites land in Phase 4.
 */
export function Projects() {
  return (
    <section>
      <h2 className="mb-6 font-serif text-2xl text-charcoal">Projects</h2>
      <EmptyState
        title="No projects yet."
        hint="Ideas become projects — capture one first, then promote it."
      />
    </section>
  )
}
