import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db } from '@/db/db'

/**
 * Project overview — Phase 3 stub. Promotion navigates here (ui-ux-design.md
 * §3.3), so it must be a real destination, but the full overview (status sheet,
 * details block, per-section preview cards, inbox banner — §6) is Phase 4/5. For
 * now it confirms the project exists and shows its title, status, and seeded
 * details so the promote flow reads as complete.
 */
export function ProjectOverview() {
  const { id } = useParams<{ id: string }>()
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])

  if (project === undefined) {
    return <p className="text-charcoal-muted">Loading…</p>
  }
  if (!project || project.deleted) {
    return (
      <div>
        <p className="text-charcoal">Project not found.</p>
        <Link to="/projects" className="mt-2 inline-block text-terracotta">
          Back to projects
        </Link>
      </div>
    )
  }

  const details = Object.entries(project.details ?? {})

  return (
    <section>
      <Link
        to="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-charcoal"
      >
        <ChevronLeft size={16} /> Projects
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-charcoal">{project.title}</h2>
        {project.status && (
          <span className="flex-shrink-0 rounded-full bg-stoneware px-3 py-1 text-sm text-charcoal">
            {project.status}
          </span>
        )}
      </div>

      {details.length > 0 && (
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-charcoal-muted">{k}</dt>
              <dd className="tabular text-charcoal">{String(v) || '—'}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-8 text-sm text-charcoal-muted">
        Sections, journal, and the project inbox arrive in the next phase.
      </p>
    </section>
  )
}
