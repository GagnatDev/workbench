import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateThumbnail } from './thumbnail'

/**
 * jsdom has no real `createImageBitmap` or canvas codecs, so we stub both seams
 * to exercise the downscale math and the WebP→JPEG fallback. The contract under
 * test: a too-large image is capped to 256px on its longest edge, WebP is
 * preferred, and an undecodable blob yields null (callers fall back to the full
 * image).
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stubCanvas(toDataURL: (type: string, q?: number) => string) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL,
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
  return canvas
}

it('downscales to the 256px cap and prefers WebP', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1024, height: 512, close: vi.fn() })),
  )
  const canvas = stubCanvas((type) => `data:${type};base64,AAAA`)

  const out = await generateThumbnail(new Blob(['x'], { type: 'image/png' }))

  expect(out).toBe('data:image/webp;base64,AAAA')
  // Longest edge (1024) scaled to 256 → 4× downscale, aspect preserved.
  expect(canvas.width).toBe(256)
  expect(canvas.height).toBe(128)
})

it('falls back to JPEG when WebP encoding is unsupported', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })),
  )
  // A browser without a WebP encoder returns PNG regardless of the requested type.
  stubCanvas((type) => (type === 'image/webp' ? 'data:image/png;base64,PNG' : 'data:image/jpeg;base64,JPG'))

  const out = await generateThumbnail(new Blob(['x'], { type: 'image/png' }))

  expect(out).toBe('data:image/jpeg;base64,JPG')
})

it('returns null when the blob cannot be decoded as an image', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw new Error('not an image')
    }),
  )

  expect(await generateThumbnail(new Blob(['nope']))).toBeNull()
})

describe('without a createImageBitmap implementation', () => {
  it('degrades to null rather than throwing', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    expect(await generateThumbnail(new Blob(['x']))).toBeNull()
  })
})
