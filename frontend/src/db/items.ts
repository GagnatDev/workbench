import { db } from './db'
import { deleteLocal, writeLocal } from './sync'
import { generateThumbnail } from '@/lib/thumbnail'
import type { Attachment, Item, Section } from './types'
import { validatePayload, type MaterialPayload, type SectionKind, type TaskPayload } from './payload'
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

/**
 * A remembered material: its name, the unit it was last used with, and the id of
 * the source item it came from (the most recent occurrence) so it can be cloned
 * with its tags, notes, and photo.
 */
export interface MaterialSuggestion {
  name: string
  unit: string
  sourceItemId: string
}

/**
 * Distinct material names drawn from projects *related* to this section's project,
 * each carrying the unit it was most recently used with — powering the
 * add-material autocomplete so recurring supplies (a glaze, a clay body) don't get
 * re-typed each project. Two projects are related when they share a collection
 * (same non-null `collection_id`) or at least one tag; the section's own project is
 * always included. A project with no collection and no tags is therefore related
 * only to itself, so suggestions fall back to its own past materials.
 */
export async function materialSuggestions(section: Section): Promise<MaterialSuggestion[]> {
  const project = await db.projects.get(section.project_id)
  if (!project) return []

  const [projects, sections, items] = await Promise.all([
    db.projects.toArray(),
    db.sections.toArray(),
    db.items.toArray(),
  ])

  // Projects related to ours — by shared collection or a shared tag (self included).
  const related = new Set<string>()
  for (const p of projects) {
    if (p.deleted) continue
    const sameCollection = p.collection_id != null && p.collection_id === project.collection_id
    const sharedTag = project.tags.some((t) => (p.tags ?? []).includes(t))
    if (p.id === project.id || sameCollection || sharedTag) related.add(p.id)
  }

  // Their materials sections.
  const materialSectionIds = new Set(
    sections.filter((s) => !s.deleted && s.kind === 'materials' && related.has(s.project_id)).map((s) => s.id),
  )

  // Group live, named items by normalized title; the newest occurrence is the
  // clone source (its tags/notes/photo) and supplies the unit.
  const byName = new Map<string, { name: string; unit: string; at: string; sourceId: string }>()
  for (const item of items) {
    if (item.deleted || !materialSectionIds.has(item.section_id)) continue
    const name = item.title?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const unit = ((item.payload as MaterialPayload).unit ?? '').trim()
    const at = item.updated_at
    const prev = byName.get(key)
    if (!prev || at > prev.at) {
      // Newer wins, but don't let a blank unit erase a remembered one.
      byName.set(key, { name, unit: unit || prev?.unit || '', at, sourceId: item.id })
    } else if (!prev.unit && unit) {
      prev.unit = unit
    }
  }

  return [...byName.values()]
    .map(({ name, unit, sourceId }) => ({ name, unit, sourceItemId: sourceId }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Clone a material into `section` from a remembered one (the autocomplete "use a
 * past material" action): copies its unit, tags, notes, and photo, but leaves the
 * quantity blank — the amount is per-project. Returns the new item id (or `null`
 * if the source vanished). The photo is duplicated, not moved, so the source keeps
 * its own (contrast `fileIdea`, which re-points a consumed idea's attachment).
 */
export async function cloneMaterial(
  section: Section,
  sourceItemId: string,
): Promise<string | null> {
  const source = await db.items.get(sourceItemId)
  if (!source || source.deleted) return null

  const { unit } = source.payload as MaterialPayload
  const itemId = await createItem(section, {
    title: source.title,
    body: source.body,
    payload: { quantity: '', unit: (unit ?? '').trim() },
    tags: source.tags ?? [],
  })

  const photo = (await db.attachments.where('owner_id').equals(source.id).toArray()).find(
    (a) => !a.deleted && a.owner_type === 'item',
  )
  if (photo) await duplicateItemPhoto(photo, itemId)
  return itemId
}

/**
 * Duplicate an item photo onto another item. The new row carries the source's
 * `storage_key`/`uploaded`/`thumb`: if the source was uploaded both rows resolve
 * the same stored object (`GET /api/files/:id` reads each row's key; soft-deletes
 * never remove the object, so sharing is safe); if not, the copied local blob is
 * uploaded as a fresh object on the next sync. The inline `thumb` makes it render
 * instantly either way.
 */
async function duplicateItemPhoto(source: Attachment, itemId: string): Promise<void> {
  const id = crypto.randomUUID()
  const blobRow = await db.blobs.get(source.id)
  if (blobRow) await db.blobs.put({ id, blob: blobRow.blob })
  await writeLocal('attachments', {
    id,
    owner_type: 'item',
    owner_id: itemId,
    storage_key: source.storage_key,
    content_type: source.content_type,
    uploaded: source.uploaded,
    thumb: source.thumb,
  })
}
