import { Camera, Link as LinkIcon } from 'lucide-react'

/**
 * Quick-capture bottom sheet (ui-ux-design.md §2). Phase 1 renders the shell —
 * destination chip, the type-free field, photo/link affordances — so the nav's
 * centre ➕ has a real destination. The capture logic (save Idea, presigned photo
 * upload, dismiss-saves) lands in Phase 3.
 */
export function CaptureSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-charcoal/30"
      />
      <div className="relative mx-auto w-full max-w-[680px] rounded-t-2xl bg-stoneware p-4 pb-8 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-divider" />
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-oatmeal px-3 py-1 text-sm text-charcoal-muted">
            📥 Inbox ▾
          </span>
        </div>
        <textarea
          disabled
          rows={3}
          placeholder="Type an idea…  (capture lands in Phase 3)"
          className="w-full resize-none rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none"
        />
        <div className="mt-3 flex gap-4 text-charcoal-muted">
          <span className="inline-flex items-center gap-1 text-sm">
            <Camera size={18} /> Photo
          </span>
          <span className="inline-flex items-center gap-1 text-sm">
            <LinkIcon size={18} /> Link
          </span>
        </div>
      </div>
    </div>
  )
}
