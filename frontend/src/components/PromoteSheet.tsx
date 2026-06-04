import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { db } from '@/db/db'
import { promoteIdea } from '@/db/ideas'
import type { Idea } from '@/db/types'
import { DEFAULT_TEMPLATE_ID, STAGE_TEMPLATES } from '@/lib/templates'

/** First non-empty line of the idea, the natural project title (ui-ux-design.md §3.3). */
function firstLine(idea: Idea): string {
  const line = idea.content.split('\n').find((l) => l.trim())?.trim() ?? ''
  return line.slice(0, 80)
}

/**
 * Promote mini-sheet (ui-ux-design.md §3.3): title prefilled from the idea's first
 * line (editable) + a stage-template picker defaulting to the last-used template.
 * Confirm creates the Project, reparents the idea into its inbox, and navigates
 * into the new project. Fast enough to keep the swipe's momentum, but never makes
 * an untitled project or one with the wrong stages.
 */
export function PromoteSheet({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(() => firstLine(idea))
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID)
  const [creating, setCreating] = useState(false)

  // Default to the last template the user picked (§3.3).
  useEffect(() => {
    void db._meta.get('lastTemplate').then((row) => {
      if (row?.value) setTemplateId(row.value)
    })
  }, [])

  const create = async () => {
    if (creating) return
    setCreating(true)
    const projectId = await promoteIdea(idea, title, templateId)
    onClose()
    navigate(`/projects/${projectId}`)
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="promote-title">
      <h2 id="promote-title" className="mb-3 font-serif text-lg text-charcoal">
        Promote to project
      </h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Project title"
        className="w-full rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />

      <div className="mt-4">
        <span className="text-sm text-charcoal-muted">Template</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {STAGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={
                templateId === t.id
                  ? 'rounded-full bg-terracotta px-3 py-1.5 text-sm text-oatmeal'
                  : 'rounded-full bg-oatmeal px-3 py-1.5 text-sm text-charcoal'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void create()}
        disabled={creating}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta py-3 text-oatmeal disabled:opacity-60"
      >
        Create <ArrowRight size={18} />
      </button>
    </BottomSheet>
  )
}
