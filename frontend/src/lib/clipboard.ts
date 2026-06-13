/**
 * Clipboard image helpers shared by every composer/photo affordance.
 *
 * Two ways to get an image off the clipboard:
 *  - an explicit "Paste" button via the async Clipboard API (readImageFromClipboard)
 *  - a Cmd/Ctrl+V into a text field via the paste event (imageFromPasteEvent)
 *
 * Both yield a File, which is exactly what the existing photo handlers accept.
 */

/** Whether the async Clipboard API can read images (Chrome/Edge/Safari). */
export function clipboardReadSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.read
}

/**
 * Read the first image on the clipboard as a File, or null when there is none,
 * the API is unsupported, or permission/gesture is missing. Never throws — the
 * caller treats null as "nothing to paste".
 */
export async function readImageFromClipboard(): Promise<File | null> {
  if (!clipboardReadSupported()) return null
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (type) {
        const blob = await item.getType(type)
        const ext = type.split('/')[1] || 'png'
        return new File([blob], `pasted-${Date.now()}.${ext}`, { type })
      }
    }
  } catch {
    // denied / no user gesture / empty clipboard — fall through to null
  }
  return null
}

/**
 * Extract an image File from a paste event's clipboard data, or null. Returns
 * null for ordinary text pastes, so the caller can leave those untouched.
 */
export function imageFromPasteEvent(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
