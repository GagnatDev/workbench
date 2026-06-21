import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Bookmark } from 'lucide-react'
import { db } from '@/db/db'
import type { Idea } from '@/db/types'
import { timeAgo } from '@/lib/time'
import { domainOf } from '@/lib/links'
import { AttachmentThumb } from './AttachmentThumb'
import { Linkify } from './Linkify'
import { LinkBadge } from './LinkBadge'

const SWIPE_THRESHOLD = 96
const TAP_SLOP = 8
// Hold duration before a press promotes the idea. Tunable — adjust to taste.
const LONG_PRESS_MS = 500

/**
 * An inbox idea card with swipe-to-triage (ui-ux-design.md §3.2, §11.2 — swipe is
 * inbox-only). Swipe right reveals the olive keep underlay; swipe left the
 * terracotta archive underlay; release past threshold fires the action, a small
 * movement is a tap that opens the detail sheet. A long-press (no movement)
 * promotes the idea to a project. The detail sheet exposes all three actions, so
 * pointers without a swipe/press (desktop) lose nothing. An already-kept card has
 * no keep underlay and right-swipe is a no-op.
 */
export function IdeaCard({
  idea,
  onTap,
  onArchive,
  onKeep,
  onPromote,
}: {
  idea: Idea
  onTap: () => void
  onArchive: () => void
  onKeep: () => void
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
  const longPressed = useRef(false)
  const longPressTimer = useRef<number | null>(null)
  // Already-kept cards can't be kept again; right-swipe is a no-op for them.
  const keepable = idea.state !== 'kept'

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  // Clear any pending timer if the card unmounts mid-press.
  useEffect(() => cancelLongPress, [])

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    swiped.current = false
    longPressed.current = false
    cancelLongPress()
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      navigator.vibrate?.(10)
      onPromote()
    }, LONG_PRESS_MS)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const moveX = e.clientX - start.current.x
    // Any real movement means it's a swipe/scroll, not a press.
    if (Math.abs(moveX) > TAP_SLOP) {
      swiped.current = true
      cancelLongPress()
    }
    setDx(moveX)
  }
  const onPointerUp = () => {
    cancelLongPress()
    if (!longPressed.current) {
      if (dx >= SWIPE_THRESHOLD && keepable) onKeep()
      else if (dx <= -SWIPE_THRESHOLD) onArchive()
    }
    start.current = null
    setDx(0)
  }

  return (
    <li className="relative overflow-hidden rounded-card">
      {/* Action underlays revealed by the swipe. */}
      <div className="absolute inset-0 flex items-center justify-between px-4 text-oatmeal">
        <span
          className={`flex items-center gap-1 ${dx > 0 && keepable ? 'opacity-100' : 'opacity-0'}`}
        >
          <Bookmark size={18} /> {t('idea.keep')}
        </span>
        <span className={`flex items-center gap-1 ${dx < 0 ? 'opacity-100' : 'opacity-0'}`}>
          {t('idea.archive')} <Archive size={18} />
        </span>
      </div>
      <div
        className="absolute inset-0"
        style={{
          backgroundColor:
            dx > 0 ? (keepable ? '#7A826B' : 'transparent') : dx < 0 ? '#C87A63' : 'transparent',
        }}
        aria-hidden
      />

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (!swiped.current && !longPressed.current) onTap()
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
