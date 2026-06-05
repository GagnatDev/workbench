import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db } from '@/db/db'
import { JournalSection } from '@/components/sections/JournalSection'
import { MoodboardSection } from '@/components/sections/MoodboardSection'
import { ChecklistSection } from '@/components/sections/ChecklistSection'
import { MaterialsSection } from '@/components/sections/MaterialsSection'
import { TagFilterBar } from '@/components/TagFilterBar'
import { itemsOfSection } from '@/db/items'
import { collectTags } from '@/lib/tags'

/**
 * Section screen (ui-ux-design.md §7, screen inventory #13–16): full-screen, with
 * the kind-specific UI. Sections are routable so the PWA can restore where you
 * were (§12). This page owns the header (← back to the project overview, section
 * name · project title) and dispatches the body to the renderer for its `kind`.
 */
export function Section() {
  const { t } = useTranslation()
  const { id, sid } = useParams<{ id: string; sid: string }>()
  const section = useLiveQuery(() => (sid ? db.sections.get(sid) : undefined), [sid])
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])
  const allTags =
    useLiveQuery(async () => (sid ? collectTags(await itemsOfSection(sid)) : []), [sid]) ?? []
  const [tagFilter, setTagFilter] = useState<string[]>([])

  if (section === undefined || project === undefined) {
    return <p className="text-charcoal-muted">{t('common.loading')}</p>
  }
  if (!section || section.deleted) {
    return (
      <div>
        <p className="text-charcoal">{t('section.not_found')}</p>
        <Link to={`/projects/${id}`} className="mt-2 inline-block text-terracotta">
          {t('section.back_to_project')}
        </Link>
      </div>
    )
  }

  return (
    <section>
      <div className="mb-5 flex items-baseline gap-2">
        <Link
          to={`/projects/${id}`}
          aria-label={t('section.back_to_project')}
          className="text-charcoal-muted hover:text-charcoal"
        >
          <ChevronLeft size={20} />
        </Link>
        <h2 className="min-w-0 truncate font-serif text-xl text-charcoal">{section.name}</h2>
        {project && (
          <span className="flex-shrink-0 text-sm text-charcoal-muted">· {project.title}</span>
        )}
      </div>

      <TagFilterBar allTags={allTags} active={tagFilter} onChange={setTagFilter} />

      {section.kind === 'journal' && <JournalSection section={section} tagFilter={tagFilter} />}
      {section.kind === 'moodboard' && <MoodboardSection section={section} tagFilter={tagFilter} />}
      {section.kind === 'checklist' && <ChecklistSection section={section} tagFilter={tagFilter} />}
      {section.kind === 'materials' && <MaterialsSection section={section} tagFilter={tagFilter} />}
    </section>
  )
}
