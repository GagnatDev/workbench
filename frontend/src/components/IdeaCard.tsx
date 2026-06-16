import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, FolderPlus } from 'lucide-react'
import { db } from '@/db/db'
import type { Idea } from '@/db/types'
import { timeAgo } from '@/lib/time'
import { domainOf } from '@/lib/links'
import { AttachmentThumb } from './AttachmentThumb'
import { Linkify } from './Linkify'
import { LinkBadge } from './LinkBadge'

const SWIPE_THRESHOLD = 96
const TAP_SLOP = 8

/**
 * An inbox idea card with swipe-to-triage (ui-ux-design.md §3.2, §11.2 — swipe is
 * inbox-only). Swipe right reveals the terracotta promote underlay; swipe left the
 * olive archive underlay; release past threshold fires the action, a small
 * movement is a tap that opens the detail sheet. The detail sheet exposes the
 * same actions, so pointers without a swipe (desktop) lose nothing.
 */
export function IdeaCard({
  idea,
  onTap,
  onArchive,
  onPromote,
}: {
  idea: Idea
  onTap: () => void
  onArchive: () => void
  onPromote: () => void
}) {
  const { t } = useTranslation()
  const photo = useLiveQuery(
    async () => {
      const atts = await db.attachments.where('owner_id').equals(idea.id).toArray()
      return atts.find((a) => !a.deleted && a.owner_type === 'idea')
    },
    [idea.id],
  )
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    swiped.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const moveX = e.clientX - start.current.x
    if (Math.abs(moveX) > TAP_SLOP) swiped.current = true
    setDx(moveX)
  }
  const onPointerUp = () => {
    if (dx >= SWIPE_THRESHOLD) onPromote()
    else if (dx <= -SWIPE_THRESHOLD) onArchive()
    start.current = null
    setDx(0)
  }

  return (
    <li className="relative overflow-hidden rounded-card">
      {/* Action underlays revealed by the swipe. */}
      <div className="absolute inset-0 flex items-center justify-between px-4 text-oatmeal">
        <span className={`flex items-center gap-1 ${dx > 0 ? 'opacity-100' : 'opacity-0'}`}>
          <FolderPlus size={18} /> {t('idea.promote_short')}
        </span>
        <span className={`flex items-center gap-1 ${dx < 0 ? 'opacity-100' : 'opacity-0'}`}>
          {t('idea.archive')} <Archive size={18} />
        </span>
      </div>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: dx > 0 ? '#C87A63' : dx < 0 ? '#7A826B' : 'transparent' }}
        aria-hidden
      />

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (!swiped.current) onTap()
        }}
        style={{ transform: `translateX(${dx}px)` }}
        className="relative flex w-full touch-pan-y items-start gap-3 bg-stoneware p-3 text-left transition-transform"
      >
        {photo && (
          <AttachmentThumb
            attachmentId={photo.id}
            uploaded={photo.uploaded}
            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
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
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-charcoal-muted">
            <span>{timeAgo(idea.created_at)}</span>
            {idea.link && <LinkBadge link={idea.link} />}
            {(idea.tags ?? []).map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </span>
        </span>
      </button>
    </li>
  )
}
