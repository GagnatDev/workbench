import { Router } from "express";
import type { Db } from "../db/kysely.js";
import { HttpError } from "../middleware/error.js";
import { logger } from "../logger.js";
import { UserRepository } from "../storage/userRepository.js";
import { deleteUserObjects } from "../storage/s3.js";

/**
 * DELETE /api/account — self-service account deletion. Removes everything linked
 * to the caller within this app: their object-storage photos and the `users`
 * row (whose `ON DELETE CASCADE` wipes all content tables). The external auth
 * identity is intentionally left intact — a later login re-provisions a fresh,
 * empty account. resolveUser has already mapped the token to `req.userId`.
 *
 * S3 cleanup is best-effort: object storage being unreachable must not leave the
 * user stuck with an undeletable account, and the DB cascade still removes every
 * piece of their actual content. Orphaned blobs are private and uuid-keyed under
 * the (now freed) `${userId}/` prefix, so a failed sweep is a storage-cost note,
 * not a data leak — we log it for a later sweep and proceed with the row delete.
 */
export function accountRoutes(db: Db): Router {
  const router = Router();
  router.delete("/account", async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new HttpError(401, "Not authenticated");
      try {
        await deleteUserObjects(userId);
      } catch (err) {
        logger.warn(
          { err, userId },
          "account deletion: S3 cleanup failed, proceeding with row delete",
        );
      }
      await new UserRepository(db).deleteById(userId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
  return router;
}
