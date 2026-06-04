import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { EmptyState } from '@/components/EmptyState'
import { db } from '@/db/db'
import type { Project } from '@/db/types'

/** Favourites pinned on top, then rank order (ui-ux-design.md §5). */
function projectOrder(a: Project, b: Project): number {
  if (a.favourite !== b.favourite) return a.favourite ? -1 : 1
  return a.rank.localeCompare(b.rank)
}

/**
 * Projects tab. Phase 3 lands a minimal real list so a promoted idea has a
 * visible home; the full §5 treatment (collection filter chips, latest-photo
 * thumbnails, time-since-last-entry, favourite toggles, the header ➕) arrives in
 * Phase 4.
 */
export function Projects() {
  const projects =
    useLiveQuery(async () => {
      const all = await db.projects.toArray()
      return all.filter((p) => !p.deleted).sort(projectOrder)
    }, []) ?? []

  return (
    <section>
      <h2 className="mb-6 font-serif text-2xl text-charcoal">Projects</h2>
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          hint="Ideas become projects — capture one first, then promote it."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-card bg-stoneware p-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-lg text-charcoal">
                    {p.favourite && <span className="text-flax">★ </span>}
                    {p.title}
                  </span>
                </span>
                {p.status && (
                  <span className="ml-3 flex-shrink-0 rounded-full bg-oatmeal px-2.5 py-1 text-xs text-charcoal">
                    {p.status}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
