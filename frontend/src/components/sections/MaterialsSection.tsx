import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ClipboardPaste, Plus, Trash2, X } from 'lucide-react'
import { clipboardReadSupported, imageFromPasteEvent, readImageFromClipboard } from '@/lib/clipboard'
import { BottomSheet } from '../BottomSheet'
import { EmptyState } from '../EmptyState'
import { ReorderableList } from '../ReorderableList'
import { AttachmentThumb } from '../AttachmentThumb'
import { TagInput } from '../TagInput'
import { Linkify } from '../Linkify'
import { useSectionItems } from '@/db/useSectionItems'
import {
  addItemPhoto,
  allItemTags,
  createItem,
  deleteItem,
  removeAttachment,
  setItemPayload,
  setItemRank,
  updateItem,
} from '@/db/items'
import { matchesTags } from '@/lib/tags'
import type { MaterialPayload } from '@/db/payload'
import type { Attachment, Item, Section } from '@/db/types'

/**
 * Materials section (ui-ux-design.md §7.3): rows show *name · quantity unit* with
 * notes as a second line and an optional photo thumbnail. The bottom add-field
 * adds a name (the composer grammar); quantity, unit, notes, and a photo are
 * filled in behind a row tap. Long-press drag reorders (§8).
 */
export function MaterialsSection({
  section,
  tagFilter = [],
}: {
  section: Section
  tagFilter?: string[]
}) {
  const { t } = useTranslation()
  const data = useSectionItems(section.id)
  const items = (data?.items ?? []).filter((i) => matchesTags(i.tags, tagFilter))
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)

  const add = async () => {
    const title = name.trim()
    if (!title) return
    await createItem(section, { title, payload: { quantity: '', unit: '' } })
    setName('')
  }

  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title={t('materials.empty.title')} hint={t('materials.empty.hint')} />
      ) : (
        <ReorderableList
          items={items}
          onReorder={(item, rank) => void setItemRank(item, rank)}
          className="flex flex-col"
          rowClassName="list-none"
          renderItem={(item) => {
            const { quantity, unit } = item.payload as MaterialPayload
            const photo = data?.byOwner.get(item.id)?.[0]
            const amount = [quantity, unit].filter(Boolean).join(' ')
            return (
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="flex w-full items-center gap-3 border-b border-divider py-2.5 text-left"
              >
                {photo && (
                  <AttachmentThumb
                    attachmentId={photo.id}
                    uploaded={photo.uploaded}
                    className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                    alt=""
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words text-charcoal">
                      {item.title || t('common.untitled')}
                    </span>
                    {amount && (
                      <span className="tabular flex-shrink-0 text-sm text-charcoal-muted">
                        {amount}
                      </span>
                    )}
                  </span>
                  {item.body && (
                    <Linkify
                      text={item.body}
                      className="mt-0.5 block break-words text-sm text-charcoal-muted"
                    />
                  )}
                </span>
              </button>
            )
          }}
        />
      )}

      <div className="mt-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder={t('materials.placeholder')}
          className="min-w-0 flex-1 rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <button
          type="button"
          aria-label={t('materials.add_aria')}
          onClick={() => void add()}
          disabled={!name.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-terracotta text-oatmeal disabled:opacity-40"
        >
          <Plus size={20} />
        </button>
      </div>

      {editing && (
        <MaterialEditSheet
          item={editing}
          photo={data?.byOwner.get(editing.id)?.[0] ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** Edit a material's name, quantity, unit, notes, and photo (or delete it). */
function MaterialEditSheet({
  item,
  photo,
  onClose,
}: {
  item: Item
  photo: Attachment | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const payload = item.payload as MaterialPayload
  const [title, setTitle] = useState(item.title ?? '')
  const [quantity, setQuantity] = useState(payload.quantity ?? '')
  const [unit, setUnit] = useState(payload.unit ?? '')
  const [body, setBody] = useState(item.body ?? '')
  const [tags, setTags] = useState<string[]>(item.tags ?? [])
  const suggestions = useLiveQuery(() => allItemTags(), []) ?? []
  const fileInput = useRef<HTMLInputElement>(null)

  const save = async () => {
    await updateItem(item, { title: title.trim() || null, body: body.trim() || null, tags })
    await setItemPayload(item, 'materials', { quantity: quantity.trim(), unit: unit.trim() })
  }

  const pastePhoto = async () => {
    const file = await readImageFromClipboard()
    if (file) await addItemPhoto(item.id, file)
  }

  const onPasteImage = (e: React.ClipboardEvent) => {
    if (photo) return // a material holds one photo; don't replace via stray paste
    const file = imageFromPasteEvent(e.nativeEvent)
    if (file) {
      e.preventDefault()
      void addItemPhoto(item.id, file)
    }
  }

  const field =
    'rounded-lg bg-oatmeal p-2.5 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40'

  return (
    <BottomSheet
      onClose={() => {
        void save()
        onClose()
      }}
      labelledBy="material-edit"
    >
      <h2 id="material-edit" className="mb-3 font-serif text-lg text-charcoal">
        {t('materials.edit_title')}
      </h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('materials.name_placeholder')}
        className={`w-full ${field}`}
      />
      <div className="mt-2 flex gap-2">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={t('materials.quantity_placeholder')}
          className={`tabular min-w-0 flex-1 ${field}`}
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder={t('materials.unit_placeholder')}
          className={`min-w-0 flex-1 ${field}`}
        />
      </div>
      <textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onPaste={onPasteImage}
        placeholder={t('materials.notes_placeholder')}
        className={`mt-2 w-full resize-none ${field}`}
      />

      <div className="mt-3">
        <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>

      <div className="mt-3">
        {photo ? (
          <div className="relative inline-block">
            <AttachmentThumb
              attachmentId={photo.id}
              uploaded={photo.uploaded}
              className="max-h-32 rounded-lg object-cover"
            />
            <button
              type="button"
              aria-label={t('common.remove_photo')}
              onClick={() => void removeAttachment(photo.id)}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-charcoal text-oatmeal"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-charcoal"
            >
              <Camera size={18} /> {t('materials.add_photo')}
            </button>
            {clipboardReadSupported() && (
              <button
                type="button"
                onClick={() => void pastePhoto()}
                className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-charcoal"
              >
                <ClipboardPaste size={18} /> {t('common.paste')}
              </button>
            )}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addItemPhoto(item.id, file)
            e.target.value = ''
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          void deleteItem(item.id)
          onClose()
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-brick"
      >
        <Trash2 size={16} /> {t('materials.delete')}
      </button>
    </BottomSheet>
  )
}
