import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MoreHorizontal } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { IdeaCard } from '@/components/IdeaCard'
import { IdeaDetailSheet } from '@/components/IdeaDetailSheet'
import { PromoteSheet } from '@/components/PromoteSheet'
import { db } from '@/db/db'
import { setIdeaState } from '@/db/ideas'
import type { Idea } from '@/db/types'

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
 * Global Inbox (ui-ux-design.md §3): New / Kept segments (New = unprocessed
 * captures, the badge counts New only), with archived behind the overflow menu.
 * Cards are newest-first; swipe right archives, swipe left promotes (§3.2), tap
 * opens the detail sheet. Inbox-zero on New keeps the satisfying empty state.
 */
export function Inbox() {
  const [segment, setSegment] = useState<Segment>('new')
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [detail, setDetail] = useState<Idea | null>(null)
  const [promote, setPromote] = useState<Idea | null>(null)

  // Global ideas only (project_id == null); project inboxes arrive in Phase 5.
  const ideas =
    useLiveQuery(async () => {
      const all = await db.ideas.toArray()
      return all.filter((i) => !i.deleted && i.project_id == null)
    }, []) ?? []

  const newCount = ideas.filter((i) => i.state === 'captured').length
  const list = ideas.filter((i) => i.state === STATE_OF[segment]).sort(newestFirst)

  return (
    <section>
      <div className="mb-6 flex items-center justify-between border-b border-divider">
        <div className="flex gap-6 text-sm">
          <button
            type="button"
            onClick={() => setSegment('new')}
            className={
              segment === 'new'
                ? 'flex items-center gap-1.5 border-b-2 border-terracotta pb-2 font-medium text-charcoal'
                : 'flex items-center gap-1.5 pb-2 text-charcoal-muted'
            }
          >
            New
            {newCount > 0 && (
              <span className="rounded-full bg-flax px-1.5 text-xs text-charcoal">
                {newCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSegment('kept')}
            className={
              segment === 'kept'
                ? 'border-b-2 border-terracotta pb-2 font-medium text-charcoal'
                : 'pb-2 text-charcoal-muted'
            }
          >
            Kept
          </button>
          {segment === 'archived' && (
            <span className="border-b-2 border-terracotta pb-2 font-medium text-charcoal">
              Archived
            </span>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="More"
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
                {segment === 'archived' ? 'Back to inbox' : 'View archived'}
              </button>
            </div>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={
            segment === 'new'
              ? 'Tap ➕ to capture your first idea.'
              : segment === 'kept'
                ? 'Nothing kept yet.'
                : 'No archived ideas.'
          }
          hint={
            segment === 'new'
              ? undefined
              : segment === 'kept'
                ? 'Ideas you keep land here — still promotable later.'
                : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onTap={() => setDetail(idea)}
              onArchive={() => void setIdeaState(idea, 'archived')}
              onPromote={() => setPromote(idea)}
            />
          ))}
        </ul>
      )}

      {detail && (
        <IdeaDetailSheet
          idea={detail}
          onClose={() => setDetail(null)}
          onPromote={(idea) => {
            setDetail(null)
            setPromote(idea)
          }}
        />
      )}
      {promote && <PromoteSheet idea={promote} onClose={() => setPromote(null)} />}
    </section>
  )
}
