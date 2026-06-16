import { afterEach, expect, it, vi } from 'vitest'
import { compressImageForUpload, MAX_UPLOAD_BYTES } from './image'

/**
 * jsdom has no real `createImageBitmap` or canvas codecs, so we stub both seams.
 * The contract under test: small/non-image blobs pass through untouched,
 * over-cap images are downscaled to 2560px on the longest edge and re-encoded
 * stepping JPEG quality down until they fit, and an undecodable blob falls back
 * to the original (the server cap is the real backstop).
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A blob reporting `size` bytes without actually allocating them. */
function fakeBlob(size: number, type = 'image/jpeg'): Blob {
  return { size, type } as Blob
}

/**
 * Stub the canvas so `toBlob` yields a blob whose size is driven by `sizeFor(q)`,
 * letting a test model "lower quality → smaller file".
 */
function stubCanvas(sizeFor: (quality: number) => number) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb: (b: Blob | null) => void, _type: string, quality: number) =>
      cb(fakeBlob(sizeFor(quality))),
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
  return canvas
}

it('passes a blob already under the cap through untouched', async () => {
  const small = fakeBlob(MAX_UPLOAD_BYTES - 1)
  const create = vi.fn()
  vi.stubGlobal('createImageBitmap', create)

  expect(await compressImageForUpload(small)).toBe(small)
  expect(create).not.toHaveBeenCalled() // never even decoded
})

it('passes a non-image blob through untouched', async () => {
  const pdf = fakeBlob(MAX_UPLOAD_BYTES + 1, 'application/pdf')
  expect(await compressImageForUpload(pdf)).toBe(pdf)
})

it('downscales an over-cap image to the 2560px long edge', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 5120, height: 2560, close: vi.fn() })),
  )
  const canvas = stubCanvas(() => 1000) // first encode already fits

  await compressImageForUpload(fakeBlob(MAX_UPLOAD_BYTES + 1))

  // Longest edge (5120) scaled to 2560 → 2× downscale, aspect preserved.
  expect(canvas.width).toBe(2560)
  expect(canvas.height).toBe(1280)
})

it('steps quality down until the encode fits under the cap', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
  )
  // 0.85 and 0.75 stay over cap; 0.65 finally fits.
  const sizeByQuality: Record<string, number> = {
    '0.85': MAX_UPLOAD_BYTES + 100,
    '0.75': MAX_UPLOAD_BYTES + 10,
    '0.65': MAX_UPLOAD_BYTES - 1,
  }
  stubCanvas((q) => sizeByQuality[String(q)] ?? MAX_UPLOAD_BYTES + 1000)

  const out = await compressImageForUpload(fakeBlob(MAX_UPLOAD_BYTES * 3))

  expect(out.size).toBe(MAX_UPLOAD_BYTES - 1)
})

it('returns the smallest encode when nothing fits, never larger than the original', async () => {
  const original = fakeBlob(MAX_UPLOAD_BYTES + 5000)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
  )
  // Every quality stays over cap; lower quality is smaller, so the last wins —
  // but it's still smaller than the original, so we keep it.
  stubCanvas((q) => MAX_UPLOAD_BYTES + Math.round(q * 1000))

  const out = await compressImageForUpload(original)

  expect(out).not.toBe(original)
  expect(out.size).toBeLessThan(original.size)
})

it('falls back to the original when the blob cannot be decoded', async () => {
  const original = fakeBlob(MAX_UPLOAD_BYTES + 1)
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw new Error('not an image')
    }),
  )

  expect(await compressImageForUpload(original)).toBe(original)
})
