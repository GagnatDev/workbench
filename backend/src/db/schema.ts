import type { ColumnType, Generated } from "kysely";

// Defaulted timestamp: selected as Date, never written by app code.
type DefaultTimestamp = ColumnType<Date, never, never>;
// Like DefaultTimestamp but app code may set it on write (e.g. updated_at = now()).
type UpdatableTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * Server-side identity. NOT a synced content table — the app owns its own user
 * ids and maps the homectl-auth JWT `sub` in via `auth_sub`. Every content table
 * (Phase 2+) is scoped by `user_id` -> `users.id` (never the auth `sub`).
 */
export interface UsersTable {
  id: Generated<string>;
  auth_sub: string;
  email: string | null;
  display_name: string | null;
  /** Cached app role from the JWT (`member` | `admin`). */
  app_role: string | null;
  created_at: DefaultTimestamp;
  updated_at: UpdatableTimestamp;
  last_seen_at: UpdatableTimestamp;
}

/**
 * The uniform last-write-wins (LWW) envelope shared by every syncable content
 * table (migration 002). `id` is client-generated (offline-first); `user_id` is
 * always forced from the auth token on write; `updated_at` is server-stamped and
 * drives both conflict resolution and the pull cursor; `deleted` is a tombstone
 * (rows are never hard-deleted, so deletions propagate). See storage/syncRepository.ts.
 */
interface SyncColumns {
  id: string;
  user_id: string;
  created_at: DefaultTimestamp;
  updated_at: UpdatableTimestamp;
  deleted: ColumnType<boolean, boolean | undefined, boolean>;
}

export interface CollectionsTable extends SyncColumns {
  name: string;
  rank: string;
}

export interface ProjectsTable extends SyncColumns {
  title: string;
  description: string | null;
  collection_id: string | null;
  status: string | null;
  /** Ordered stage list, seeded from a client-side template (Phase 4). */
  stages: ColumnType<unknown[], string, string>;
  /** Free-form one-off specs (dimensions, firing temp…). */
  details: ColumnType<Record<string, unknown>, string, string>;
  favourite: ColumnType<boolean, boolean | undefined, boolean>;
  rank: string;
}

export interface SectionsTable extends SyncColumns {
  project_id: string;
  /** `journal` | `moodboard` | `checklist` | `materials`. */
  kind: string;
  name: string;
  rank: string;
}

export interface ItemsTable extends SyncColumns {
  section_id: string;
  title: string | null;
  body: string | null;
  /** Kind-specific shape (entry/task/pin/material), Zod-validated in app code (Phase 5). */
  payload: ColumnType<Record<string, unknown>, string, string>;
  tags: ColumnType<string[], string, string>;
  rank: string;
}

export interface IdeasTable extends SyncColumns {
  content: string;
  link: string | null;
  /** null = global Inbox; set = that project's Inbox. */
  project_id: string | null;
  /** `captured` | `kept` | `archived` | `promoted` | `filed`. */
  state: string;
  tags: ColumnType<string[], string, string>;
}

export interface AttachmentsTable extends SyncColumns {
  /** `idea` | `item` — polymorphic owner. */
  owner_type: string;
  owner_id: string;
  storage_key: string | null;
  content_type: string | null;
  uploaded: ColumnType<boolean, boolean | undefined, boolean>;
}

export interface Database {
  users: UsersTable;
  collections: CollectionsTable;
  projects: ProjectsTable;
  sections: SectionsTable;
  items: ItemsTable;
  ideas: IdeasTable;
  attachments: AttachmentsTable;
}
