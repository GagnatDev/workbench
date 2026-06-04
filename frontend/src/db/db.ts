import Dexie, { type EntityTable } from 'dexie'
import type {
  Attachment,
  Collection,
  Idea,
  Item,
  LocalBlob,
  Project,
  Section,
} from './types'

/** A single key/value row in the `_meta` table (sync cursor, etc.). */
export interface MetaRow {
  key: string
  value: string
}

/**
 * The local-first store: the source of truth while offline. One table per
 * syncable server table (Dexie rows are the wire shape + a `_dirty` flag), plus
 * `blobs` for pre-upload photos and `_meta` for the sync cursor.
 *
 * Indexes: `id` (primary, client-generated uuid), `_dirty` (to collect rows to
 * push), `updated_at`, and the foreign keys each screen filters by. Booleans
 * aren't valid IndexedDB keys, so `favourite`/`deleted` are filtered in memory.
 */
export class WorkbenchDB extends Dexie {
  collections!: EntityTable<Collection, 'id'>
  projects!: EntityTable<Project, 'id'>
  sections!: EntityTable<Section, 'id'>
  items!: EntityTable<Item, 'id'>
  ideas!: EntityTable<Idea, 'id'>
  attachments!: EntityTable<Attachment, 'id'>
  blobs!: EntityTable<LocalBlob, 'id'>
  _meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('workbench')
    this.version(1).stores({
      collections: 'id, _dirty, updated_at',
      projects: 'id, _dirty, updated_at, collection_id',
      sections: 'id, _dirty, updated_at, project_id',
      items: 'id, _dirty, updated_at, section_id',
      ideas: 'id, _dirty, updated_at, project_id, state',
      attachments: 'id, _dirty, updated_at, owner_id',
      blobs: 'id',
      _meta: 'key',
    })
  }
}

export const db = new WorkbenchDB()
