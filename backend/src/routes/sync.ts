import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import { HttpError } from "../middleware/error.js";
import {
  SyncRepository,
  isSyncTable,
  type SyncChanges,
  type SyncRow,
} from "../storage/syncRepository.js";
import { logger } from "../logger.js";

// Envelope validation only — the id/updated_at contract every row must satisfy.
// Table-specific (per-`kind`) payload validation is deferred to Phase 5; unknown
// fields pass through untouched.
const rowSchema = z
  .object({
    id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
    deleted: z.boolean().optional(),
  })
  .passthrough();

const pushSchema = z.object({
  changes: z.record(z.string(), z.array(rowSchema)).default({}),
});

/** Parse the `since` cursor; anything missing or unparseable means "from the beginning". */
function parseSince(raw: unknown): string {
  if (typeof raw === "string" && raw && raw !== "0") {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return new Date(0).toISOString();
}

/**
 * Local-first sync (LWW). Both routes run inside the authenticated `/api` router,
 * so `req.userId` (the app's own uuid) is set by resolveUser and every query is
 * scoped to it — the client cannot read or write another person's data.
 *
 *  - GET  /api/sync/pull?since=<ISO|0>  -> { serverTime, changes }
 *  - POST /api/sync/push  { changes }   -> { serverTime, applied }
 */
export function syncRoutes(db: Db): Router {
  const sync = new SyncRepository(db);
  const router = Router();

  router.get("/sync/pull", async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new HttpError(401, "Not authenticated");
      const result = await sync.pull(userId, parseSince(req.query.since));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/sync/push", async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new HttpError(401, "Not authenticated");

      const parsed = pushSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Invalid sync payload");
      }

      // Drop any unrecognized table keys (defense-in-depth; our client only ever
      // sends known tables). Column-level filtering happens in the repository.
      const changes: SyncChanges = {};
      for (const [table, rows] of Object.entries(parsed.data.changes)) {
        if (isSyncTable(table)) {
          changes[table] = rows as SyncRow[];
        } else {
          logger.warn({ table }, "sync: ignoring unknown table in push");
        }
      }

      const result = await sync.push(userId, changes);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
