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

export interface Database {
  users: UsersTable;
}
