import { Fragment } from 'react'
import { openUrl, tokenizeLinks } from '@/lib/links'

/**
 * Renders plain text with any pasted URLs turned into tappable links that open
 * in a new tab (lib/links). Link segments are `<span role="link">` rather than
 * `<a>` because several callers render their body *inside* a `<button>` (the
 * tap-to-edit journal/materials rows, the inbox card) where a nested anchor is
 * invalid HTML — `stopPropagation` lets the link fire without also triggering
 * the surrounding button.
 */
export function Linkify({ text, className }: { text: string; className?: string }) {
  const tokens = tokenizeLinks(text)
  return (
    <span className={className}>
      {tokens.map((tok, i) =>
        tok.type === 'url' ? (
          <span
            key={i}
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              openUrl(tok.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                e.preventDefault()
                openUrl(tok.value)
              }
            }}
            className="cursor-pointer text-terracotta underline-offset-2 hover:underline"
          >
            {tok.value}
          </span>
        ) : (
          <Fragment key={i}>{tok.value}</Fragment>
        ),
      )}
    </span>
  )
}
