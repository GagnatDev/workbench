import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import { logger } from "../logger.js";

/**
 * A content row as it crosses the sync boundary. The envelope (id / updated_at /
 * deleted) is universal; the rest is table-specific and passed through. `user_id`
 * is intentionally absent — the server always derives it from the auth token and
 * never trusts a client-supplied value.
 */
export type SyncRow = Record<string, unknown> & {
  id: string;
  updated_at: string;
  deleted?: boolean;
};

/** Map of table name -> rows, as carried by pull responses and push requests. */
export type SyncChanges = Partial<Record<SyncTableName, SyncRow[]>>;

interface TableSpec {
  /** Data columns the client owns (everything except the envelope + user_id). */
  columns: readonly string[];
  /** Subset of `columns` stored as jsonb (bound as a stringified ::jsonb param). */
  json: ReadonlySet<string>;
}

/**
 * The syncable tables and the columns the client may write. Column names come
 * only from this trusted config (never from request data), so they are safe to
 * interpolate as SQL identifiers; all row *values* are bound as parameters.
 */
const SYNC_TABLES = {
  collections: { columns: ["name", "rank"], json: new Set<string>() },
  projects: {
    columns: [
      "title",
      "description",
      "collection_id",
      "status",
      "stages",
      "details",
      "favourite",
      "tags",
      "rank",
      "cover",
    ],
    json: new Set(["stages", "details", "tags"]),
  },
  sections: {
    columns: ["project_id", "kind", "name", "rank"],
    json: new Set<string>(),
  },
  items: {
    columns: ["section_id", "title", "body", "payload", "tags", "rank"],
    json: new Set(["payload", "tags"]),
  },
  ideas: {
    columns: ["content", "link", "project_id", "state", "tags"],
    json: new Set(["tags"]),
  },
  attachments: {
    columns: [
      "owner_type",
      "owner_id",
      "storage_key",
      "content_type",
      "uploaded",
      "thumb",
    ],
    json: new Set<string>(),
  },
} satisfies Record<string, TableSpec>;

export type SyncTableName = keyof typeof SYNC_TABLES;
export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTableName[];

export function isSyncTable(name: string): name is SyncTableName {
  return name in SYNC_TABLES;
}

export interface PullResult {
  /** Server clock at the moment of the read — the client's next `since` cursor. */
  serverTime: string;
  changes: Record<SyncTableName, SyncRow[]>;
}

export interface PushResult {
  serverTime: string;
  /** Authoritative server state for every pushed id, so the client can reconcile. */
  applied: Record<SyncTableName, SyncRow[]>;
}

/** Postgres returns timestamptz as Date; the wire format is ISO strings. */
function serializeRow(row: Record<string, unknown>): SyncRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out as SyncRow;
}

/**
 * Last-write-wins sync against Postgres. Two operations, both strictly scoped to
 * one `userId`:
 *
 *  - pull: every row changed since the client's cursor (tombstones included).
 *  - push: upsert each client row, applying it only when its `updated_at` is at
 *    least the stored one (LWW). On every accepted write the server stamps
 *    `updated_at = now()` so the cursor lives in a single (server) clock domain —
 *    this is what guarantees no change is ever skipped on a later pull. The
 *    client's `updated_at` is used only for the conflict comparison.
 *
 * The single-timestamp LWW model accepts that two near-simultaneous edits on
 * skewed clocks resolve by wall-clock order (rare for a personal, few-device
 * app — see the plan's sync design). Per-`kind` payload integrity is enforced in
 * the local-first client on write (domain model); here rows pass through
 * structurally and `payload` is stored as opaque jsonb.
 */
export class SyncRepository {
  constructor(private readonly db: Db) {}

  async pull(userId: string, since: string): Promise<PullResult> {
    const { rows: timeRows } = await sql<{ now: Date }>`SELECT now() AS now`.execute(
      this.db,
    );
    const serverTime = timeRows[0]!.now.toISOString();

    const changes = {} as Record<SyncTableName, SyncRow[]>;
    for (const table of SYNC_TABLE_NAMES) {
      const { rows } = await sql<Record<string, unknown>>`
        SELECT * FROM ${sql.table(table)}
        WHERE ${sql.ref("user_id")} = ${userId}
          AND ${sql.ref("updated_at")} > ${since}::timestamptz
        ORDER BY ${sql.ref("updated_at")} ASC
      `.execute(this.db);
      changes[table] = rows.map(serializeRow);
    }
    return { serverTime, changes };
  }

  async push(userId: string, changes: SyncChanges): Promise<PushResult> {
    // Track which ids were submitted per table so we can return authoritative
    // server state for each (applied or not) for the client to reconcile against.
    const pushedIds = {} as Record<SyncTableName, string[]>;
    for (const table of SYNC_TABLE_NAMES) pushedIds[table] = [];

    for (const table of SYNC_TABLE_NAMES) {
      const rows = changes[table];
      if (!rows?.length) continue;
      for (const row of rows) {
        pushedIds[table].push(row.id);
        try {
          await this.upsertRow(table, userId, row);
        } catch (err) {
          // One bad row must not poison the batch; it stays dirty on the client
          // and is retried next push. (Our own client writes well-formed rows;
          // this guards against constraint violations from malformed input.)
          logger.warn({ err, table, id: row.id }, "sync: row upsert skipped");
        }
      }
    }

    const applied = {} as Record<SyncTableName, SyncRow[]>;
    let serverTime = new Date(0).toISOString();
    const { rows: timeRows } = await sql<{ now: Date }>`SELECT now() AS now`.execute(
      this.db,
    );
    serverTime = timeRows[0]!.now.toISOString();

    for (const table of SYNC_TABLE_NAMES) {
      const ids = pushedIds[table];
      if (!ids.length) {
        applied[table] = [];
        continue;
      }
      const { rows } = await sql<Record<string, unknown>>`
        SELECT * FROM ${sql.table(table)}
        WHERE ${sql.ref("user_id")} = ${userId}
          AND ${sql.ref("id")} = ANY(${ids}::uuid[])
      `.execute(this.db);
      applied[table] = rows.map(serializeRow);
    }
    return { serverTime, applied };
  }

  /**
   * Insert-or-update one row under LWW. `user_id` is forced to `userId` (the
   * ON CONFLICT guard also refuses to touch a row owned by anyone else). The
   * stored `updated_at` is always `now()`; the client's `updated_at` is bound
   * separately and used only to decide whether the incoming write wins.
   */
  private async upsertRow(
    table: SyncTableName,
    userId: string,
    row: SyncRow,
  ): Promise<void> {
    const spec = SYNC_TABLES[table];
    const dataCols = spec.columns;

    const insertCols = sql.join(
      ["id", "user_id", ...dataCols, "deleted"].map((c) => sql.ref(c)),
      sql`, `,
    );
    const insertVals = sql.join(
      [
        sql`${row.id}`,
        sql`${userId}`,
        ...dataCols.map((col) => {
          const value = row[col] ?? null;
          return spec.json.has(col)
            ? sql`${JSON.stringify(value)}::jsonb`
            : sql`${value}`;
        }),
        sql`${row.deleted ?? false}`,
      ],
      sql`, `,
    );
    const setClause = sql.join(
      [...dataCols, "deleted"].map(
        (c) => sql`${sql.ref(c)} = ${sql.raw("EXCLUDED.")}${sql.ref(c)}`,
      ),
      sql`, `,
    );

    await sql`
      INSERT INTO ${sql.table(table)} (${insertCols}, ${sql.ref("updated_at")})
      VALUES (${insertVals}, now())
      ON CONFLICT (${sql.ref("id")}) DO UPDATE SET
        ${setClause},
        ${sql.ref("updated_at")} = now()
      WHERE ${sql.ref(`${table}.user_id`)} = ${sql.raw("EXCLUDED.user_id")}
        AND ${row.updated_at}::timestamptz >= ${sql.ref(`${table}.updated_at`)}
    `.execute(this.db);
  }
}
