/**
 * Client-side thumbnail generation. We downscale a captured photo to a small
 * data URL that rides the sync on the attachment row (`Attachment.thumb`), so
 * list/grid views render instantly on every device without fetching the
 * full-size image from object storage. The original is untouched and still
 * uploaded to S3 for full-size viewing.
 */

/** Longest-edge cap for the thumbnail — large enough for a moodboard tile, tiny on the wire. */
const MAX_EDGE = 256
/** WebP quality; ~256px at 0.7 lands around 5–15 KB. */
const QUALITY = 0.7

/**
 * Generate a downscaled thumbnail of an image blob and return it as a data URL
 * (`data:image/webp;base64,…`, falling back to JPEG where WebP encoding is
 * unsupported). Resolves to null if the blob can't be decoded as an image, so
 * callers degrade gracefully to the full-image path.
 */
export async function generateThumbnail(blob: Blob): Promise<string | null> {
  let bitmap: ImageBitmap
  try {
    // `from-image` applies EXIF orientation so the thumb matches how the browser
    // renders the original in an <img>.
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    return null
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)

    const webp = canvas.toDataURL('image/webp', QUALITY)
    // Browsers that can't encode WebP silently return a PNG data URL; prefer the
    // smaller JPEG in that case.
    return webp.startsWith('data:image/webp')
      ? webp
      : canvas.toDataURL('image/jpeg', QUALITY)
  } finally {
    bitmap.close()
  }
}
