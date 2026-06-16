/**
 * Client-side compression of full-size uploads. Photos straight off a phone
 * camera routinely run 5–12 MB; we cap the original we store locally and push
 * to object storage so sync stays cheap and the bucket doesn't fill with
 * untouched DSLR-sized files. Small images pass through unchanged — we only
 * re-encode a blob that exceeds the cap. (Distinct from thumbnail.ts, which
 * makes the tiny inline `thumb` that rides the attachment row; this keeps the
 * full-size original viewable, just lighter.)
 */

/**
 * Largest upload we keep as-is. Anything bigger is downscaled/re-encoded to fit
 * under it before storage. The backend should enforce the same ceiling as a
 * backstop for clients that can't compress (see uploads presign).
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB

/** Longest-edge cap for a compressed original — ample for full-screen viewing. */
const MAX_EDGE = 2560
/** JPEG qualities tried in turn; we stop at the first encode that fits the cap. */
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.5]

/**
 * Return a version of `blob` that fits under {@link MAX_UPLOAD_BYTES}, or the
 * original untouched when it's already small enough, isn't an image, or can't be
 * decoded (the server cap is the backstop in that last case). Over-cap images are
 * downscaled to {@link MAX_EDGE} on the longest edge and re-encoded as JPEG,
 * stepping quality down until they fit; if even the lowest quality is still over
 * cap we return the smallest result we produced (better than the raw upload).
 */
export async function compressImageForUpload(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/') || blob.size <= MAX_UPLOAD_BYTES) return blob

  let bitmap: ImageBitmap
  try {
    // Apply EXIF orientation so the re-encoded pixels match how the browser
    // renders the original (matches generateThumbnail).
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    return blob
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0, width, height)

    let best: Blob | null = null
    for (const quality of QUALITY_STEPS) {
      const candidate = await canvasToBlob(canvas, quality)
      if (!candidate) break
      if (!best || candidate.size < best.size) best = candidate
      if (candidate.size <= MAX_UPLOAD_BYTES) return candidate
    }
    // Never got under the cap (or encoding failed): take the smallest result,
    // but never hand back something larger than what we started with.
    return best && best.size < blob.size ? best : blob
  } finally {
    bitmap.close()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}
