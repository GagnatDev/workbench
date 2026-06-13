import { db } from './db'
import { deleteLocal, writeLocal } from './sync'
import { generateThumbnail } from '@/lib/thumbnail'
import type { Item, Section } from './types'
import { validatePayload, type SectionKind, type TaskPayload } from './payload'
import { compareRank, rankAfter } from '@/lib/rank'

/**
 * Item lifecycle (Phase 5). An Item is the atomic record inside a Section — a
 * journal entry, a checklist task, a moodboard pin, a materials line. Shared
 * fields (title/body/tags/rank) live on the row; the kind-specific bit lives in
 * `payload`, validated against the owning Section's `kind` on every write (see
 * payload.ts). All operations are local-first writes that sync like any other row.
 */

/** A photo to attach to a new item (journal/moodboard/materials), kept local. */
export interface ItemPhoto {
  id: string
  blob: Blob
}

export interface NewItemFields {
  title?: string | null
  body?: string | null
  /** Kind-specific; validated against `section.kind`. */
  payload: Record<string, unknown>
  tags?: string[]
  photo?: ItemPhoto | null
}

/** All live items of a section, in rank order (the kind renderer may re-sort). */
export async function itemsOfSection(sectionId: string): Promise<Item[]> {
  const all = await db.items.where('section_id').equals(sectionId).toArray()
  return all.filter((i) => !i.deleted).sort((a, b) => compareRank(a.rank, b.rank))
}

/**
 * Create an item in a section, appended at the end (the journal feed re-sorts by
 * `entry_at`; the other kinds keep rank order). Validates the payload for the
 * section's kind first, then — if a photo was supplied — stores its blob locally
 * and an `item`-owned attachment row (the presigned upload happens in the sync
 * engine, exactly as for captured ideas). Returns the new item id.
 */
export async function createItem(section: Section, fields: NewItemFields): Promise<string> {
  const payload = validatePayload(section.kind, fields.payload)
  const itemId = crypto.randomUUID()

  if (fields.photo) {
    await db.blobs.put({ id: fields.photo.id, blob: fields.photo.blob })
    await writeLocal('attachments', {
      id: fields.photo.id,
      owner_type: 'item',
      owner_id: itemId,
      storage_key: null,
      content_type: fields.photo.blob.type || 'image/jpeg',
      uploaded: false,
      thumb: await generateThumbnail(fields.photo.blob),
    })
  }

  const existing = await itemsOfSection(section.id)
  const maxRank = existing.length ? existing[existing.length - 1]!.rank : null

  await writeLocal('items', {
    id: itemId,
    section_id: section.id,
    title: fields.title?.trim() || null,
    body: fields.body?.trim() || null,
    payload,
    tags: fields.tags ?? [],
    rank: rankAfter(maxRank),
  })
  return itemId
}

/** Patch an item's shared fields (title/body/tags) from its editor. */
export async function updateItem(
  item: Item,
  patch: Partial<Pick<Item, 'title' | 'body' | 'tags'>>,
): Promise<void> {
  await writeLocal('items', { ...item, ...patch })
}

/** Replace an item's payload, re-validating it against the section's kind. */
export async function setItemPayload(
  item: Item,
  kind: SectionKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await writeLocal('items', { ...item, payload: validatePayload(kind, payload) })
}

/** Toggle a checklist task's done flag (ui-ux-design.md §7.3). */
export async function toggleTask(item: Item): Promise<void> {
  const done = !(item.payload as TaskPayload).done
  await setItemPayload(item, 'checklist', { done })
}

/** Reposition an item within its section (drag reorder, §8). */
export async function setItemRank(item: Item, rank: string): Promise<void> {
  await writeLocal('items', { ...item, rank })
}

/**
 * Attach a photo to an existing item (e.g. adding a snap to a material after the
 * fact). Stores the blob locally and an `item`-owned attachment row; the sync
 * engine uploads it on reconnect, exactly like a capture photo.
 */
export async function addItemPhoto(itemId: string, blob: Blob): Promise<string> {
  const id = crypto.randomUUID()
  await db.blobs.put({ id, blob })
  await writeLocal('attachments', {
    id,
    owner_type: 'item',
    owner_id: itemId,
    storage_key: null,
    content_type: blob.type || 'image/jpeg',
    uploaded: false,
    thumb: await generateThumbnail(blob),
  })
  return id
}

/** Remove a single attachment (tombstone) — its blob stays for any other use. */
export async function removeAttachment(attachmentId: string): Promise<void> {
  await deleteLocal('attachments', attachmentId)
}

/** Soft-delete an item and cascade to its attachments (mirrors deleteSection). */
export async function deleteItem(id: string): Promise<void> {
  const atts = await db.attachments.where('owner_id').equals(id).toArray()
  for (const att of atts) {
    if (!att.deleted && att.owner_type === 'item') await deleteLocal('attachments', att.id)
  }
  await deleteLocal('items', id)
}

/** Distinct tags across the user's items, for item-editor tag autocomplete. */
export async function allItemTags(): Promise<string[]> {
  const items = await db.items.toArray()
  const set = new Set<string>()
  for (const item of items) {
    if (item.deleted) continue
    for (const tag of item.tags ?? []) set.add(tag)
  }
  return [...set].sort()
}
