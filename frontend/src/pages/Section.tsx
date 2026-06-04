import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db } from '@/db/db'
import { JournalSection } from '@/components/sections/JournalSection'
import { MoodboardSection } from '@/components/sections/MoodboardSection'
import { ChecklistSection } from '@/components/sections/ChecklistSection'
import { MaterialsSection } from '@/components/sections/MaterialsSection'

/**
 * Section screen (ui-ux-design.md §7, screen inventory #13–16): full-screen, with
 * the kind-specific UI. Sections are routable so the PWA can restore where you
 * were (§12). This page owns the header (← back to the project overview, section
 * name · project title) and dispatches the body to the renderer for its `kind`.
 */
export function Section() {
  const { id, sid } = useParams<{ id: string; sid: string }>()
  const section = useLiveQuery(() => (sid ? db.sections.get(sid) : undefined), [sid])
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])

  if (section === undefined || project === undefined) {
    return <p className="text-charcoal-muted">Loading…</p>
  }
  if (!section || section.deleted) {
    return (
      <div>
        <p className="text-charcoal">Section not found.</p>
        <Link to={`/projects/${id}`} className="mt-2 inline-block text-terracotta">
          Back to project
        </Link>
      </div>
    )
  }

  return (
    <section>
      <div className="mb-5 flex items-baseline gap-2">
        <Link
          to={`/projects/${id}`}
          aria-label="Back to project"
          className="text-charcoal-muted hover:text-charcoal"
        >
          <ChevronLeft size={20} />
        </Link>
        <h2 className="min-w-0 truncate font-serif text-xl text-charcoal">{section.name}</h2>
        {project && (
          <span className="flex-shrink-0 text-sm text-charcoal-muted">· {project.title}</span>
        )}
      </div>

      {section.kind === 'journal' && <JournalSection section={section} />}
      {section.kind === 'moodboard' && <MoodboardSection section={section} />}
      {section.kind === 'checklist' && <ChecklistSection section={section} />}
      {section.kind === 'materials' && <MaterialsSection section={section} />}
    </section>
  )
}
