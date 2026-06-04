import { useRef, useState } from 'react'
import { Inbox } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { Composer, emptyDraft, isDraftEmpty, type ComposerDraft } from './Composer'
import { captureIdea } from '@/db/ideas'

/**
 * Quick-capture sheet (ui-ux-design.md §2): keyboard already up, no Save button —
 * **dismiss saves**, an empty capture is discarded (§11.1 composer grammar).
 * Reuses the shared `BottomSheet` + `Composer`. The destination chip shows where
 * the idea lands; in Phase 3 that's always the global Inbox (project-scoped
 * capture, where the chip retargets, arrives with project screens in Phase 5).
 */
export function CaptureSheet({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<ComposerDraft>(emptyDraft)
  // The latest draft, read at dismiss time without making onClose depend on it.
  const draftRef = useRef(draft)
  draftRef.current = draft

  const save = () => {
    void captureIdea(draftRef.current, null)
    onClose()
  }

  return (
    <BottomSheet onClose={save} labelledBy="capture-dest">
      <div id="capture-dest" className="mb-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-oatmeal px-3 py-1 text-sm text-charcoal-muted">
          <Inbox size={14} /> Inbox
        </span>
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
