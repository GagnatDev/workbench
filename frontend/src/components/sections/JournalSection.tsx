import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, Send, Trash2 } from 'lucide-react'
import { BottomSheet } from '../BottomSheet'
import { Composer, emptyDraft, isDraftEmpty, type ComposerDraft } from '../Composer'
import { AttachmentThumb } from '../AttachmentThumb'
import { PhotoViewer } from '../PhotoViewer'
import { EmptyState } from '../EmptyState'
import { TagInput } from '../TagInput'
import { useSectionItems } from '@/db/useSectionItems'
import { allItemTags, createItem, deleteItem, setItemPayload, updateItem } from '@/db/items'
import { matchesTags } from '@/lib/tags'
import type { EntryPayload } from '@/db/payload'
import type { Item, Section } from '@/db/types'

/** datetime-local round-trips: ISO ⇄ the input's local "YYYY-MM-DDTHH:mm". */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(value: string): string {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString()
}

function entryAtOf(item: Item): string {
  return (item.payload as EntryPayload).entry_at ?? item.created_at ?? ''
}

/** Date-divider label: "Today" / "Yesterday" / "20 May" (+ year if not this one). */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'long', day: 'numeric' }
      : { month: 'long', day: 'numeric', year: 'numeric' }
  return d.toLocaleDateString(undefined, opts)
}

/**
 * Journal section (ui-ux-design.md §7.1): a reverse-chronological feed grouped by
 * date — newest on top, because reopening a project you want the latest state.
 * Entries are plain text on the base background (no per-entry card boxes — the
 * feed reads as a page, visual-identity.md) with a tappable photo strip. The
 * composer reuses the shared grammar (§11.1): type → send, plus a 🕒 backdate
 * control for "logging yesterday's kiln opening". It sits at the top here, with
 * the newest entries, so it never hides behind the bottom nav and stays one tap
 * from where attention already is.
 */
export function JournalSection({
  section,
  tagFilter = [],
}: {
  section: Section
  tagFilter?: string[]
}) {
  const data = useSectionItems(section.id)
  const [draft, setDraft] = useState<ComposerDraft>(emptyDraft)
  const [entryAt, setEntryAt] = useState<string | null>(null) // null = now
  const [showBackdate, setShowBackdate] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [viewer, setViewer] = useState<string[] | null>(null)

  const items = (data?.items ?? [])
    .filter((i) => matchesTags(i.tags, tagFilter))
    .sort((a, b) => entryAtOf(b).localeCompare(entryAtOf(a)))

  const submit = async () => {
    if (isDraftEmpty(draft)) return
    const at = entryAt ?? new Date().toISOString()
    await createItem(section, {
      body: draft.text,
      payload: { entry_at: at },
      photo: draft.photo ? { id: draft.photo.id, blob: draft.photo.blob } : null,
    })
    if (draft.photo) URL.revokeObjectURL(draft.photo.url)
    setDraft(emptyDraft())
    setEntryAt(null)
    setShowBackdate(false)
  }

  // Render date dividers as we walk the (already sorted) feed.
  let lastDay = ''

  return (
    <div>
      <div className="mb-5 rounded-card bg-stoneware p-3">
        <Composer
          draft={draft}
          onChange={setDraft}
          allowLink={false}
          placeholder="Add an entry…"
          onSubmit={() => void submit()}
          trailing={
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Backdate entry"
                aria-pressed={showBackdate}
                onClick={() => setShowBackdate((v) => !v)}
                className={`inline-flex items-center gap-1 text-sm hover:text-charcoal ${
                  entryAt ? 'text-terracotta' : ''
                }`}
              >
                <Clock size={18} />
              </button>
              <button
                type="button"
                aria-label="Add entry"
                onClick={() => void submit()}
                disabled={isDraftEmpty(draft)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-terracotta text-oatmeal disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          }
        />
        {showBackdate && (
          <input
            type="datetime-local"
            value={toLocalInput(entryAt ?? new Date().toISOString())}
            onChange={(e) => setEntryAt(fromLocalInput(e.target.value))}
            className="mt-2 rounded-lg bg-oatmeal p-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          />
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title="No entries yet." hint="Log what you did — a line is enough." />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => {
            const at = entryAtOf(item)
            const label = dayLabel(at)
            const showDivider = label !== lastDay
            lastDay = label
            const photos = data?.byOwner.get(item.id) ?? []
            return (
              <div key={item.id}>
                {showDivider && (
                  <div className="mb-3 mt-1 flex items-center gap-3">
                    <span className="text-xs uppercase tracking-wide text-charcoal-muted">
                      {label}
                    </span>
                    <span className="h-px flex-1 bg-divider" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="block w-full text-left"
                >
                  {item.body && (
                    <p className="whitespace-pre-wrap break-words text-charcoal">{item.body}</p>
                  )}
                </button>
                {photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setViewerAt(photos, i, setViewer)}
                        className="overflow-hidden rounded-lg"
                      >
                        <AttachmentThumb
                          attachmentId={p.id}
                          uploaded={p.uploaded}
                          className="h-24 w-24 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && <JournalEntrySheet item={editing} onClose={() => setEditing(null)} />}
      {viewer && <PhotoViewer attachmentIds={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

/** Helper so the strip can open the viewer starting on the tapped photo. */
function setViewerAt(
  photos: { id: string }[],
  i: number,
  setViewer: (ids: string[]) => void,
): void {
  // Rotate so the tapped photo is first (PhotoViewer starts at index 0).
  const ids = photos.map((p) => p.id)
  setViewer([...ids.slice(i), ...ids.slice(0, i)])
}

/** Edit an entry: text, backdate, delete (the slower actions behind a tap). */
function JournalEntrySheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const [body, setBody] = useState(item.body ?? '')
  const [at, setAt] = useState(entryAtOf(item))
  const [tags, setTags] = useState<string[]>(item.tags ?? [])
  const suggestions = useLiveQuery(() => allItemTags(), []) ?? []

  const latest = useRef({ body, at, tags })
  latest.current = { body, at, tags }

  const save = async () => {
    const { body: b, at: a, tags: t } = latest.current
    const tagsChanged = JSON.stringify(t) !== JSON.stringify(item.tags ?? [])
    if (b !== (item.body ?? '') || tagsChanged) {
      await updateItem(item, { body: b.trim() || null, tags: t })
    }
    if (a !== entryAtOf(item)) await setItemPayload(item, 'journal', { entry_at: a })
  }
  useEffect(() => () => void save(), [])

  return (
    <BottomSheet
      onClose={() => {
        void save()
        onClose()
      }}
      labelledBy="entry-edit"
    >
      <h2 id="entry-edit" className="sr-only">
        Edit entry
      </h2>
      <textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full resize-none rounded-lg bg-oatmeal p-3 text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />
      <label className="mt-3 block text-sm text-charcoal-muted">
        Date
        <input
          type="datetime-local"
          value={toLocalInput(at)}
          onChange={(e) => setAt(fromLocalInput(e.target.value))}
          className="mt-1 block rounded-lg bg-oatmeal p-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
      </label>
      <div className="mt-3">
        <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>
      <button
        type="button"
        onClick={() => {
          void deleteItem(item.id)
          onClose()
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-brick"
      >
        <Trash2 size={16} /> Delete entry
      </button>
    </BottomSheet>
  )
}
