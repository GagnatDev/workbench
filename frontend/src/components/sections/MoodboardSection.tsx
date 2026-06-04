import { useRef, useState } from 'react'
import { Link as LinkIcon, Plus, X } from 'lucide-react'
import { BottomSheet } from '../BottomSheet'
import { AttachmentThumb } from '../AttachmentThumb'
import { PhotoViewer } from '../PhotoViewer'
import { useSectionItems } from '@/db/useSectionItems'
import { createItem, deleteItem } from '@/db/items'
import type { PinPayload } from '@/db/payload'
import type { Section } from '@/db/types'

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Moodboard section (ui-ux-design.md §7.2): a two-column masonry. Image pins
 * render at natural aspect ratio (no frames, visual-identity.md) — cropping
 * references to squares defeats the point. Link pins are compact Stoneware cards
 * (domain + caption) — honest about V1's lack of scraped previews. Tap an image →
 * full-screen viewer; tap a link → open it. The ➕ tile adds a photo or a URL.
 */
export function MoodboardSection({ section }: { section: Section }) {
  const data = useSectionItems(section.id)
  const items = data?.items ?? []
  const [adding, setAdding] = useState(false)
  const [viewer, setViewer] = useState<{ ids: string[]; start: number } | null>(null)

  // The ordered list of image-pin attachment ids, so the viewer can page between
  // them (and a tapped image opens at its own position).
  const imageIds: string[] = []
  for (const item of items) {
    if ((item.payload as PinPayload).subtype === 'image') {
      const att = data?.byOwner.get(item.id)?.[0]
      if (att) imageIds.push(att.id)
    }
  }

  return (
    <div>
      {items.length === 0 && (
        <p className="mb-4 text-center text-sm text-charcoal-muted">
          Collect references — photos and links that set the mood.
        </p>
      )}

      <div className="columns-2 gap-3">
        {items.map((item) => {
          const payload = item.payload as PinPayload
          const caption = item.title?.trim()
          if (payload.subtype === 'link') {
            return (
              <PinFrame key={item.id} onDelete={() => void deleteItem(item.id)}>
                <a
                  href={payload.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-card bg-stoneware p-3"
                >
                  <span className="flex items-center gap-1.5 text-terracotta">
                    <LinkIcon size={15} />
                    <span className="truncate text-sm">{domainOf(payload.url)}</span>
                  </span>
                  {caption && <span className="mt-1 block break-words text-charcoal">{caption}</span>}
                </a>
              </PinFrame>
            )
          }
          const att = data?.byOwner.get(item.id)?.[0]
          const at = att ? imageIds.indexOf(att.id) : -1
          return (
            <PinFrame key={item.id} onDelete={() => void deleteItem(item.id)}>
              {att ? (
                <button
                  type="button"
                  onClick={() => setViewer({ ids: imageIds, start: Math.max(0, at) })}
                  className="block w-full overflow-hidden rounded-card"
                >
                  <AttachmentThumb
                    attachmentId={att.id}
                    uploaded={att.uploaded}
                    className="w-full rounded-card object-cover"
                    alt={caption ?? 'Pin'}
                  />
                </button>
              ) : (
                // Image pin with no photo (e.g. a text-only idea filed here).
                <div className="rounded-card bg-stoneware p-3 text-charcoal">{caption ?? '—'}</div>
              )}
              {att && caption && (
                <span className="mt-1 block break-words text-sm text-charcoal-muted">{caption}</span>
              )}
            </PinFrame>
          )
        })}

        <div className="mb-3 break-inside-avoid">
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add pin"
            className="flex aspect-square w-full items-center justify-center rounded-card border-2 border-dashed border-divider text-charcoal-muted hover:border-terracotta hover:text-terracotta"
          >
            <Plus size={28} />
          </button>
        </div>
      </div>

      {adding && <AddPinSheet section={section} onClose={() => setAdding(false)} />}
      {viewer && (
        <PhotoViewer
          attachmentIds={viewer.ids}
          startIndex={viewer.start}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}

/** A masonry cell with a hover/visible delete control (top-right). */
function PinFrame({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="relative mb-3 break-inside-avoid">
      {children}
      <button
        type="button"
        aria-label="Delete pin"
        onClick={onDelete}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-charcoal/60 text-oatmeal"
      >
        <X size={13} />
      </button>
    </div>
  )
}

/** Add a pin: a photo (image pin) or a URL with optional caption (link pin). */
function AddPinSheet({ section, onClose }: { section: Section; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    await createItem(section, {
      payload: { subtype: 'image' },
      photo: { id: crypto.randomUUID(), blob: file },
    })
    onClose()
  }

  const addLink = async () => {
    const u = url.trim()
    if (!u) return
    await createItem(section, { title: caption.trim() || null, payload: { subtype: 'link', url: u } })
    onClose()
  }

  const field =
    'w-full rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40'

  return (
    <BottomSheet onClose={onClose} labelledBy="add-pin">
      <h2 id="add-pin" className="mb-3 font-serif text-lg text-charcoal">
        Add to moodboard
      </h2>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta py-3 text-oatmeal"
      >
        <Plus size={18} /> Photo
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void addPhoto(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="my-4 flex items-center gap-3 text-xs text-charcoal-muted">
        <span className="h-px flex-1 bg-divider" /> or a link <span className="h-px flex-1 bg-divider" />
      </div>

      <input
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className={field}
      />
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        className={`mt-2 ${field}`}
      />
      <button
        type="button"
        onClick={() => void addLink()}
        disabled={!url.trim()}
        className="mt-3 w-full rounded-lg bg-oatmeal py-3 text-charcoal disabled:opacity-40"
      >
        Add link
      </button>
    </BottomSheet>
  )
}
