import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import { AttachmentThumb } from '@/components/AttachmentThumb'
import { EmptyState } from '@/components/EmptyState'
import { FileAsSheet } from '@/components/FileAsSheet'
import { Linkify } from '@/components/Linkify'
import { db } from '@/db/db'
import type { Idea } from '@/db/types'
import { timeAgo } from '@/lib/time'
import { domainOf } from '@/lib/links'

type Segment = 'new' | 'kept' | 'archived'
const STATE_OF: Record<Segment, Idea['state']> = {
  new: 'captured',
  kept: 'kept',
  archived: 'archived',
}

function newestFirst(a: Idea, b: Idea): number {
  return (b.created_at ?? '').localeCompare(a.created_at ?? '')
}

/**
 * Project inbox (ui-ux-design.md §9, screen #9): the same New / Kept split as the
 * global Inbox (§3.1), scoped to ideas captured into this project. Tapping an idea
 * opens the File-as sheet (§4) — promotion doesn't apply here (the idea already
 * has a home), so there's no swipe-promote; this is a calm, tap-to-file list.
 */
export function ProjectInbox() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])
  const [params] = useSearchParams()
  const initialSegment: Segment = params.get('tab') === 'kept' ? 'kept' : 'new'
  const [segment, setSegment] = useState<Segment>(initialSegment)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [file, setFile] = useState<Idea | null>(null)

  const ideas =
    useLiveQuery(async () => {
      if (!id) return []
      const all = await db.ideas.where('project_id').equals(id).toArray()
      return all.filter((i) => !i.deleted)
    }, [id]) ?? []

  const newCount = ideas.filter((i) => i.state === 'captured').length
  const list = ideas.filter((i) => i.state === STATE_OF[segment]).sort(newestFirst)

  const tabClass = (active: boolean) =>
    active
      ? 'flex items-center gap-1.5 border-b-2 border-terracotta pb-2 font-medium text-charcoal'
      : 'flex items-center gap-1.5 pb-2 text-charcoal-muted'

  return (
    <section>
      <Link
        to={`/projects/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-charcoal"
      >
        <ChevronLeft size={16} /> {project?.title ?? t('common.project_fallback')}
      </Link>

      <div className="mb-6 flex items-center justify-between border-b border-divider">
        <div className="flex gap-6 text-sm">
          <button type="button" onClick={() => setSegment('new')} className={tabClass(segment === 'new')}>
            {t('inbox.segment.new')}
            {newCount > 0 && (
              <span className="rounded-full bg-flax px-1.5 text-xs text-charcoal">{newCount}</span>
            )}
          </button>
          <button type="button" onClick={() => setSegment('kept')} className={tabClass(segment === 'kept')}>
            {t('inbox.segment.kept')}
          </button>
          {segment === 'archived' && (
            <span className="border-b-2 border-terracotta pb-2 font-medium text-charcoal">
              {t('inbox.archived')}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label={t('common.more')}
            onClick={() => setOverflowOpen((v) => !v)}
            className="pb-2 text-charcoal-muted hover:text-charcoal"
          >
            <MoreHorizontal size={20} />
          </button>
          {overflowOpen && (
            <div className="absolute right-0 z-10 mt-1 w-44 rounded-card bg-stoneware py-1 shadow-md">
              <button
                type="button"
                onClick={() => {
                  setSegment(segment === 'archived' ? 'new' : 'archived')
                  setOverflowOpen(false)
                }}
                className="block w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-oatmeal"
              >
                {segment === 'archived' ? t('project_inbox.back_to_inbox') : t('inbox.view_archived')}
              </button>
            </div>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={
            segment === 'new'
              ? t('project_inbox.empty.new')
              : segment === 'kept'
                ? t('project_inbox.empty.kept')
                : t('inbox.empty.archived')
          }
          hint={segment === 'new' ? t('project_inbox.empty.new_hint') : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((idea) => (
            <li key={idea.id}>
              <InboxCard idea={idea} onTap={() => setFile(idea)} />
            </li>
          ))}
        </ul>
      )}

      {file && id && <FileAsSheet idea={file} projectId={id} onClose={() => setFile(null)} />}
    </section>
  )
}

function InboxCard({ idea, onTap }: { idea: Idea; onTap: () => void }) {
  const { t } = useTranslation()
  const photo = useLiveQuery(async () => {
    const atts = await db.attachments.where('owner_id').equals(idea.id).toArray()
    return atts.find((a) => !a.deleted && a.owner_type === 'idea')
  }, [idea.id])

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-start gap-3 rounded-card bg-stoneware p-3 text-left"
    >
      {photo && (
        <AttachmentThumb
          attachmentId={photo.id}
          uploaded={photo.uploaded}
          className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
          alt=""
        />
      )}
      <span className="min-w-0 flex-1">
        {idea.content ? (
          <Linkify text={idea.content} className="line-clamp-2 block break-words text-charcoal" />
        ) : (
          <span className="line-clamp-2 block break-words text-charcoal">
            {idea.link ? domainOf(idea.link) : t('common.photo')}
          </span>
        )}
        <span className="mt-1 block text-xs text-charcoal-muted">{timeAgo(idea.created_at)}</span>
      </span>
    </button>
  )
}
