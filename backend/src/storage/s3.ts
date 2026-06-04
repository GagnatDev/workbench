import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

/**
 * S3 access for photo attachments. Scaleway Object Storage in production, MinIO
 * locally — both speak the S3 API, so one client config (with `forcePathStyle`)
 * serves both. Object storage is optional until photos land, so the client is
 * built lazily and only when fully configured; callers check `s3Enabled()` and
 * return 503 otherwise rather than crashing a stack that doesn't need photos.
 */

let client: S3Client | undefined;

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** The validated S3 config, or null when object storage isn't configured. */
export function s3Config(): S3Config | null {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_REGION ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  ) {
    return null;
  }
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    // Path-style addressing (bucket in the path, not the host) — required by
    // MinIO and the safe default for Scaleway too.
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
  };
}

export function s3Enabled(): boolean {
  return s3Config() !== null;
}

/** The shared S3 client. Throws if object storage isn't configured. */
export function s3(): { client: S3Client; bucket: string } {
  const cfg = s3Config();
  if (!cfg) throw new Error("S3 is not configured");
  client ??= new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return { client, bucket: cfg.bucket };
}

/**
 * The object key for an attachment. Namespaced by app user id so a presigned
 * URL can never be retargeted at another user's prefix, and ownership is legible
 * straight from the key.
 */
export function storageKeyFor(userId: string, attachmentId: string): string {
  return `${userId}/${attachmentId}`;
}
