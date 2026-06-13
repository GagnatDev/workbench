/**
 * URL helpers shared by every text surface that shows links (ui-ux-design.md —
 * pasted URLs should be tappable). The app is a web PWA, so "open" means a new
 * browser tab; YouTube and other apps are reached via the OS's own app-link
 * handoff on mobile, so there's nothing special to do for them here.
 */

/** A `https://`/`http://` URL, or a bare `www.` host we can prefix on open. */
const URL_RE = /\b(https?:\/\/[^\s]+|www\.[^\s]+)/gi
/** Trailing punctuation that's almost always sentence/markup, not part of the URL. */
const TRAILING = /[.,;:!?)\]}>"']+$/

/** The bare domain of a URL (no `www.`), or the input unchanged if unparseable. */
export function domainOf(url: string): string {
  try {
    return new URL(withScheme(url)).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Ensure a clickable href: bare `www.foo` links need an explicit scheme. */
export function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/** Open a URL in a new browser tab, keeping the app open (and severing opener). */
export function openUrl(url: string): void {
  window.open(withScheme(url), '_blank', 'noopener,noreferrer')
}

export interface LinkToken {
  type: 'text' | 'url'
  value: string
}

/**
 * Split free text into plain and URL tokens so callers can render the URL parts
 * clickable. Trailing punctuation is trimmed off a match and handed back as text
 * (so "see https://x.com." doesn't swallow the period into the link).
 */
export function tokenizeLinks(text: string): LinkToken[] {
  const tokens: LinkToken[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    let url = m[0]
    const trailing = url.match(TRAILING)?.[0] ?? ''
    if (trailing) url = url.slice(0, -trailing.length)
    if (start > last) tokens.push({ type: 'text', value: text.slice(last, start) })
    tokens.push({ type: 'url', value: url })
    if (trailing) tokens.push({ type: 'text', value: trailing })
    last = start + m[0].length
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}
