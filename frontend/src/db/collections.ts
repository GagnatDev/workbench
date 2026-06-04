import { db } from './db'
import { deleteLocal, writeLocal } from './sync'
import type { Collection } from './types'
import { rankAfter } from '@/lib/rank'

/**
 * Collections group projects by domain (ceramics, textiles, app ideas). They are
 * filters on the Projects tab, not folders (ui-ux-design.md §5) — a project
 * belongs to zero or one collection via its `collection_id`. All operations are
 * local-first writes that sync like any other row.
 */

/** Create a collection, appended after the current last one. Returns its id. */
export async function createCollection(name: string): Promise<string> {
  const existing = await db.collections.toArray()
  const ranks = existing
    .filter((c) => !c.deleted)
    .map((c) => c.rank)
    .sort()
  const maxRank = ranks.length ? ranks[ranks.length - 1] : null
  const id = await writeLocal('collections', {
    name: name.trim(),
    rank: rankAfter(maxRank ?? null),
  })
  return id
}

export async function renameCollection(collection: Collection, name: string): Promise<void> {
  await writeLocal('collections', { ...collection, name: name.trim() })
}

/**
 * Soft-delete a collection and detach its member projects (set their
 * `collection_id` to null) so they fall back to "All" rather than pointing at a
 * tombstone.
 */
export async function deleteCollection(id: string): Promise<void> {
  const members = await db.projects.where('collection_id').equals(id).toArray()
  for (const project of members) {
    if (!project.deleted) await writeLocal('projects', { ...project, collection_id: null })
  }
  await deleteLocal('collections', id)
}

/** All non-deleted collections in rank order, for filter chips and the picker. */
export async function allCollections(): Promise<Collection[]> {
  const all = await db.collections.toArray()
  return all.filter((c) => !c.deleted).sort((a, b) => a.rank.localeCompare(b.rank))
}
