/**
 * Client-side row types. These deliberately mirror the server's wire shape
 * (snake_case columns + the sync envelope) so a synced row merges into Dexie with
 * no field translation. The only client-only field is `_dirty` — a 0/1 flag
 * (IndexedDB can't index booleans) marking rows with unsynced local edits.
 */

/** The universal envelope every syncable row carries. */
export interface SyncEnvelope {
  id: string
  /** App user id (server-owned; present on rows that came back from a pull). */
  user_id?: string
  created_at?: string
  /** ISO timestamp; drives last-write-wins. Bumped on every local edit. */
  updated_at: string
  /** Tombstone — soft-deleted rows are kept locally and filtered out by the UI. */
  deleted?: boolean
  /** 1 = has local edits not yet pushed; 0/absent = in sync with the server. */
  _dirty?: number
}

export interface Collection extends SyncEnvelope {
  name: string
  rank: string
}

export interface Project extends SyncEnvelope {
  title: string
  description: string | null
  collection_id: string | null
  status: string | null
  stages: unknown[]
  details: Record<string, unknown>
  favourite: boolean
  tags: string[]
  rank: string
}

export interface Section extends SyncEnvelope {
  project_id: string
  kind: 'journal' | 'moodboard' | 'checklist' | 'materials'
  name: string
  rank: string
}

export interface Item extends SyncEnvelope {
  section_id: string
  title: string | null
  body: string | null
  payload: Record<string, unknown>
  tags: string[]
  rank: string
}

export interface Idea extends SyncEnvelope {
  content: string
  link: string | null
  project_id: string | null
  state: 'captured' | 'kept' | 'archived' | 'promoted' | 'filed'
  tags: string[]
}

export interface Attachment extends SyncEnvelope {
  owner_type: 'idea' | 'item'
  owner_id: string
  storage_key: string | null
  content_type: string | null
  uploaded: boolean
  /**
   * Small base64 (data URL) thumbnail, generated client-side at capture. Rides
   * the sync so every device renders list/grid views instantly without fetching
   * the full image. Null on legacy rows until backfilled on first view.
   */
  thumb: string | null
}

/** Local-only photo blob, held until the presigned upload lands (Phase 3). */
export interface LocalBlob {
  /** Matches the owning attachment's id. */
  id: string
  blob: Blob
}

/** The six syncable tables, in dependency-friendly order. */
export const SYNC_TABLES = [
  'collections',
  'projects',
  'sections',
  'items',
  'ideas',
  'attachments',
] as const

export type SyncTableName = (typeof SYNC_TABLES)[number]
