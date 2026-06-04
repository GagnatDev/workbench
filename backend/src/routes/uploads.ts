import { Router } from "express";
import { z } from "zod";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import { HttpError } from "../middleware/error.js";
import { s3, s3Enabled, storageKeyFor } from "../storage/s3.js";

/** Presigned URLs are short-lived; the client PUTs/GETs immediately. */
const PUT_TTL_SECONDS = 5 * 60;
const GET_TTL_SECONDS = 5 * 60;

const presignSchema = z.object({
  attachmentId: z.string().uuid(),
  contentType: z.string().min(1).max(255),
});

/**
 * Photo attachments via presigned S3 URLs (the browser transfers bytes directly
 * to object storage — they never pass through this pod).
 *
 *  - POST /api/uploads/presign  { attachmentId, contentType } -> { storageKey, url }
 *      A presigned PUT for `<userId>/<attachmentId>`. The key is derived from the
 *      authenticated user, never the client, so an upload can't be aimed at
 *      another user's prefix. The attachment row itself arrives separately over
 *      sync; presigning doesn't require it to exist yet.
 *  - GET /api/files/:attachmentId -> 302 to a presigned GET
 *      Ownership-checked against the synced `attachments` row. The bucket is
 *      private, so reads always go through a fresh short-lived signed URL.
 */
export function uploadRoutes(db: Db): Router {
  const router = Router();

  router.post("/uploads/presign", async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new HttpError(401, "Not authenticated");
      if (!s3Enabled()) throw new HttpError(503, "Object storage not configured");

      const parsed = presignSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "Invalid presign request");
      const { attachmentId, contentType } = parsed.data;

      const storageKey = storageKeyFor(userId, attachmentId);
      const { client, bucket } = s3();
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          ContentType: contentType,
        }),
        { expiresIn: PUT_TTL_SECONDS },
      );

      res.json({ storageKey, url });
    } catch (err) {
      next(err);
    }
  });

  router.get("/files/:attachmentId", async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new HttpError(401, "Not authenticated");
      if (!s3Enabled()) throw new HttpError(503, "Object storage not configured");

      const attachmentId = req.params.attachmentId;
      if (!z.string().uuid().safeParse(attachmentId).success) {
        throw new HttpError(404, "Not found");
      }
      // Ownership is enforced in SQL: the row must exist, be the caller's, and
      // not be a tombstone. A miss is a 404 — we never reveal another user's keys.
      const { rows } = await sql<{ storage_key: string | null }>`
        SELECT storage_key FROM attachments
        WHERE id = ${attachmentId}::uuid
          AND user_id = ${userId}
          AND deleted = false
      `.execute(db);
      const row = rows[0];
      if (!row || !row.storage_key) throw new HttpError(404, "Not found");

      const { client, bucket } = s3();
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: row.storage_key }),
        { expiresIn: GET_TTL_SECONDS },
      );
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
