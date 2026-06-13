import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Lightbulb, X } from 'lucide-react'
import { db } from '@/db/db'
import {
  activeHint,
  markHintSeen,
  sectionIdOf,
  useHintsEnabled,
  useSeenHints,
} from '@/lib/hints'

/**
 * The one onboarding hint for the current screen, if any (see lib/hints.ts). A calm
 * neutral card with a single line of guidance and a dismiss control — the same restraint
 * as EmptyState. Rendered once in the app shell above the page content; route changes
 * (and the data conditions below) pick which hint shows. Dismissal is permanent (per
 * device).
 */
export function HintBanner() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const enabled = useHintsEnabled()
  const seen = useSeenHints()

  // Conditions some hints depend on. Queried unconditionally (rules of hooks); cheap.
  const sectionId = sectionIdOf(pathname)
  const sectionKind =
    useLiveQuery(
      async () => (sectionId ? ((await db.sections.get(sectionId))?.kind ?? null) : null),
      [sectionId],
      null,
    ) ?? null
  const hasInboxIdeas = useLiveQuery(
    async () => {
      const all = await db.ideas.toArray()
      return all.some((i) => !i.deleted && i.project_id == null)
    },
    [],
    false,
  )

  if (!enabled) return null
  const hint = activeHint(pathname, seen, { sectionKind, hasInboxIdeas })
  if (!hint) return null

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-card bg-stoneware px-4 py-3"
    >
      <Lightbulb size={18} className="mt-0.5 flex-shrink-0 text-flax" />
      <p className="flex-1 text-sm text-charcoal">{t(hint.key)}</p>
      <button
        type="button"
        aria-label={t('hints.dismiss_aria')}
        onClick={() => void markHintSeen(hint.id)}
        className="-m-2 flex-shrink-0 p-2 text-charcoal-muted hover:text-terracotta"
      >
        <X size={18} />
      </button>
    </div>
  )
}
