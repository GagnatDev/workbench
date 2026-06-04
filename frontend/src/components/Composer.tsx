import { useRef, useState, type ReactNode } from 'react'
import { Camera, Link as LinkIcon, X } from 'lucide-react'

/**
 * A single photo held in a draft: a local blob plus an object URL for preview.
 * The id becomes the attachment id once the draft is saved.
 */
export interface ComposerPhoto {
  id: string
  blob: Blob
  url: string
}

/** The editable contents shared by every composer (capture, journal, checklist…). */
export interface ComposerDraft {
  text: string
  link: string
  photo: ComposerPhoto | null
}

export function emptyDraft(): ComposerDraft {
  return { text: '', link: '', photo: null }
}

/** The §11.1 grammar's discard rule: a draft with no text, link, or photo is empty. */
export function isDraftEmpty(d: ComposerDraft): boolean {
  return !d.text.trim() && !d.link.trim() && !d.photo
}

/**
 * The one reusable composer (ui-ux-design.md §11.1 — "one composer grammar").
 * Capture, journal, checklist, and materials all reuse *this* field + photo/link
 * affordances rather than four lookalikes. It is controlled (the parent owns the
 * draft and decides when a dismiss/submit saves); this component only renders the
 * Stoneware, serif-free field and the inline affordances.
 */
export function Composer({
  draft,
  onChange,
  placeholder = 'Type an idea…',
  autoFocus = false,
  allowPhoto = true,
  allowLink = true,
  onSubmit,
  trailing,
}: {
  draft: ComposerDraft
  onChange: (draft: ComposerDraft) => void
  placeholder?: string
  autoFocus?: boolean
  allowPhoto?: boolean
  allowLink?: boolean
  /** Bar mode (journal/checklist): pressing Enter or the send glyph commits. */
  onSubmit?: () => void
  /** Optional control rendered on the affordance row (e.g. a backdate button). */
  trailing?: ReactNode
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [showLink, setShowLink] = useState(draft.link.length > 0)

  const toggleLink = () => {
    if (showLink) onChange({ ...draft, link: '' }) // hiding clears the value
    setShowLink((v) => !v)
  }

  const pickPhoto = (file: File | undefined) => {
    if (!file) return
    if (draft.photo) URL.revokeObjectURL(draft.photo.url)
    onChange({
      ...draft,
      photo: { id: crypto.randomUUID(), blob: file, url: URL.createObjectURL(file) },
    })
  }

  const removePhoto = () => {
    if (draft.photo) URL.revokeObjectURL(draft.photo.url)
    onChange({ ...draft, photo: null })
  }

  return (
    <div>
      <textarea
        autoFocus={autoFocus}
        rows={3}
        value={draft.text}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
        onKeyDown={(e) => {
          // Bar mode commits on Enter (Shift+Enter still inserts a newline).
          if (onSubmit && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />

      {draft.photo && (
        <div className="relative mt-2 inline-block">
          <img
            src={draft.photo.url}
            alt="Attached"
            className="max-h-40 rounded-lg object-cover"
          />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={removePhoto}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-charcoal text-oatmeal"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {allowLink && showLink && (
        <input
          type="url"
          inputMode="url"
          value={draft.link}
          onChange={(e) => onChange({ ...draft, link: e.target.value })}
          placeholder="https://…"
          className="mt-2 w-full rounded-lg bg-oatmeal p-2 text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
      )}

      <div className="mt-3 flex items-center gap-4 text-charcoal-muted">
        {allowPhoto && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1 text-sm hover:text-charcoal"
          >
            <Camera size={18} /> Photo
          </button>
        )}
        {allowLink && (
          <button
            type="button"
            aria-pressed={showLink}
            onClick={toggleLink}
            className={`inline-flex items-center gap-1 text-sm hover:text-charcoal ${
              showLink ? 'text-terracotta' : ''
            }`}
          >
            <LinkIcon size={18} /> Link
          </button>
        )}
        <span className="flex-1" />
        {trailing}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          pickPhoto(e.target.files?.[0])
          e.target.value = '' // allow re-selecting the same file
        }}
      />
    </div>
  )
}
