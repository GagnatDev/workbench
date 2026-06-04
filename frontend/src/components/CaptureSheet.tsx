import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronDown, FolderOpen, Inbox } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { Composer, emptyDraft, isDraftEmpty, type ComposerDraft } from './Composer'
import { db } from '@/db/db'
import { captureIdea } from '@/db/ideas'
import { projectOrder } from '@/db/projects'

/**
 * Quick-capture sheet (ui-ux-design.md §2): keyboard already up, no Save button —
 * **dismiss saves**, an empty capture is discarded (§11.1 composer grammar).
 * Reuses the shared `BottomSheet` + `Composer`. The destination chip shows where
 * the idea lands and is **tappable to retarget** (global Inbox or any project) —
 * it defaults to the project you're inside, so a jot in the workshop files itself
 * to the right place without silently mis-filing (§2).
 */
export function CaptureSheet({
  defaultProjectId = null,
  onClose,
}: {
  defaultProjectId?: string | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ComposerDraft>(emptyDraft)
  const [dest, setDest] = useState<string | null>(defaultProjectId)
  const [picking, setPicking] = useState(false)

  const projects =
    useLiveQuery(async () => {
      const all = await db.projects.toArray()
      return all.filter((p) => !p.deleted).sort(projectOrder)
    }, []) ?? []

  // The latest draft + destination, read at dismiss time without re-binding onClose.
  const stateRef = useRef({ draft, dest })
  stateRef.current = { draft, dest }

  const save = () => {
    void captureIdea(stateRef.current.draft, stateRef.current.dest)
    onClose()
  }

  const destProject = dest ? projects.find((p) => p.id === dest) : undefined
  const destLabel = dest ? (destProject?.title ?? 'Project') : 'Inbox'

  return (
    <BottomSheet onClose={save} labelledBy="capture-dest">
      <div id="capture-dest" className="mb-3">
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-oatmeal px-3 py-1 text-sm text-charcoal-muted hover:text-charcoal"
        >
          {dest ? <FolderOpen size={14} /> : <Inbox size={14} />}
          <span className="max-w-[12rem] truncate">{destLabel}</span>
          <ChevronDown size={14} />
        </button>

        {picking && (
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-card bg-oatmeal py-1">
            <DestRow
              label="Inbox (global)"
              icon={<Inbox size={15} />}
              active={dest === null}
              onClick={() => {
                setDest(null)
                setPicking(false)
              }}
            />
            {projects.map((p) => (
              <DestRow
                key={p.id}
                label={p.title}
                icon={<FolderOpen size={15} />}
                active={dest === p.id}
                onClick={() => {
                  setDest(p.id)
                  setPicking(false)
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <Composer draft={draft} onChange={setDraft} autoFocus placeholder="Type an idea…" />
      {!isDraftEmpty(draft) && (
        <p className="mt-3 text-center text-xs text-charcoal-muted">
          Swipe down or tap away to save
        </p>
      )}
    </BottomSheet>
  )
}

function DestRow({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-charcoal hover:bg-stoneware"
      >
        <span className="text-charcoal-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {active && <Check size={15} className="text-flax" />}
      </button>
    </li>
  )
}
