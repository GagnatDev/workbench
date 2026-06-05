import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { AttachmentThumb } from '@/components/AttachmentThumb'
import { EmptyState } from '@/components/EmptyState'
import { NewProjectSheet } from '@/components/NewProjectSheet'
import { TagFilterBar } from '@/components/TagFilterBar'
import { allCollections } from '@/db/collections'
import { loadProjectCards } from '@/db/projects'
import { collectTags, matchesTags } from '@/lib/tags'
import { timeAgo } from '@/lib/time'

/**
 * Projects tab (ui-ux-design.md §5): a flat card list with a horizontally
 * scrollable collection-filter chip row ("All" + each collection), favourites
 * pinned on top. Each card shows the latest-photo thumbnail, a serif title, the
 * status badge, and time-since-last-activity (surfacing neglected work). The
 * header ➕ creates a project via the same mini-sheet as promotion (§3.3). A tag
 * filter (§9.2) narrows the list further, AND-combined with the collection chip.
 */
export function Projects() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<string | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const cards = useLiveQuery(() => loadProjectCards(), []) ?? []
  const collections = useLiveQuery(() => allCollections(), []) ?? []

  const allTags = collectTags(cards.map((c) => c.project))
  const shown = cards
    .filter((c) => filter === 'all' || c.project.collection_id === filter)
    .filter((c) => matchesTags(c.project.tags, tagFilter))

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-2xl text-charcoal">{t('projects.title')}</h2>
        <button
          type="button"
          aria-label={t('projects.new_aria')}
          onClick={() => setCreating(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta text-oatmeal active:scale-95"
        >
          <Plus size={20} />
        </button>
      </div>

      {collections.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip label={t('projects.all')} active={filter === 'all'} onClick={() => setFilter('all')} />
          {collections.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              active={filter === c.id}
              onClick={() => setFilter(c.id)}
            />
          ))}
        </div>
      )}

      <TagFilterBar allTags={allTags} active={tagFilter} onChange={setTagFilter} />

      {cards.length === 0 ? (
        <EmptyState
          title={t('projects.empty.title')}
          hint={t('projects.empty.hint')}
        />
      ) : shown.length === 0 ? (
        <EmptyState title={t('projects.empty.no_match')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(({ project, photoAttachmentId, photoUploaded, lastActivity }) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="flex items-stretch gap-3 overflow-hidden rounded-card bg-stoneware"
              >
                {photoAttachmentId ? (
                  <AttachmentThumb
                    attachmentId={photoAttachmentId}
                    uploaded={photoUploaded}
                    className="h-20 w-20 flex-shrink-0 object-cover"
                    alt=""
                  />
                ) : (
                  <span className="h-20 w-20 flex-shrink-0 bg-oatmeal" aria-hidden />
                )}
                <span className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3">
                  <span className="block truncate font-serif text-lg text-charcoal">
                    {project.favourite && <span className="text-flax">★ </span>}
                    {project.title}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-charcoal-muted">
                    {project.status && (
                      <span className="rounded-full bg-oatmeal px-2 py-0.5 text-charcoal">
                        {project.status}
                      </span>
                    )}
                    <span className="tabular">{timeAgo(lastActivity)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && <NewProjectSheet onClose={() => setCreating(false)} />}
    </section>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex-shrink-0 rounded-full bg-terracotta px-3 py-1 text-sm text-oatmeal'
          : 'flex-shrink-0 rounded-full bg-stoneware px-3 py-1 text-sm text-charcoal'
      }
    >
      {label}
    </button>
  )
}
