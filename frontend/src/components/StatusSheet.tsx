import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { setProjectStages, setProjectStatus } from '@/db/projects'
import type { Project } from '@/db/types'

/**
 * Status sheet (ui-ux-design.md §6.2): the project's stages in order, the current
 * one highlighted in flax — tap any stage to jump (no forced linear progression;
 * real work skips and regresses). "Edit stages…" flips the same sheet into the
 * rare-path editor (rename, reorder, add, delete). Saving reconciles the current
 * status if its stage was renamed or removed (see `setProjectStages`).
 */
export function StatusSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const stages = project.stages.map(String)

  if (editing) {
    return <StageEditor project={project} initial={stages} onClose={onClose} />
  }

  const jump = (stage: string) => {
    void setProjectStatus(project, stage)
    onClose()
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="status-title">
      <h2 id="status-title" className="mb-3 font-serif text-lg text-charcoal">
        Set status
      </h2>
      <ul className="flex flex-col">
        {stages.map((stage) => {
          const current = stage === project.status
          return (
            <li key={stage}>
              <button
                type="button"
                onClick={() => jump(stage)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-charcoal hover:bg-oatmeal"
              >
                <span className={current ? 'font-medium text-charcoal' : 'text-charcoal'}>
                  {stage}
                </span>
                {current && <Check size={18} className="text-flax" />}
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-3 inline-flex items-center gap-1.5 border-t border-divider pt-3 text-sm text-charcoal-muted hover:text-charcoal"
      >
        <Pencil size={15} /> Edit stages…
      </button>
    </BottomSheet>
  )
}

/** The rare-path stage editor: rename, reorder (up/down), delete, and add stages. */
function StageEditor({
  project,
  initial,
  onClose,
}: {
  project: Project
  initial: string[]
  onClose: () => void
}) {
  const [stages, setStages] = useState<string[]>(initial)

  const rename = (i: number, value: string) =>
    setStages((s) => s.map((stage, idx) => (idx === i ? value : stage)))
  const remove = (i: number) => setStages((s) => s.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) =>
    setStages((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  const add = () => setStages((s) => [...s, ''])

  const save = () => {
    const cleaned = stages.map((s) => s.trim()).filter(Boolean)
    // A project must keep at least one stage; if everything was cleared, leave it.
    void setProjectStages(project, cleaned.length ? cleaned : initial)
    onClose()
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="stage-editor-title">
      <h2 id="stage-editor-title" className="mb-3 font-serif text-lg text-charcoal">
        Edit stages
      </h2>
      <ul className="flex flex-col gap-2">
        {stages.map((stage, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input
              value={stage}
              onChange={(e) => rename(i, e.target.value)}
              placeholder="Stage name"
              className="min-w-0 flex-1 rounded-lg bg-oatmeal p-2 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
            />
            <button
              type="button"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className="p-1 text-charcoal-muted hover:text-charcoal disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={i === stages.length - 1}
              onClick={() => move(i, 1)}
              className="p-1 text-charcoal-muted hover:text-charcoal disabled:opacity-30"
            >
              <ArrowDown size={16} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${stage || 'stage'}`}
              onClick={() => remove(i)}
              className="p-1 text-charcoal-muted hover:text-brick"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-charcoal-muted hover:text-charcoal"
      >
        <Plus size={15} /> Add stage
      </button>
      <button
        type="button"
        onClick={save}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta py-3 text-oatmeal"
      >
        Save stages
      </button>
    </BottomSheet>
  )
}
