import { Link as LinkIcon } from 'lucide-react'
import { domainOf, openUrl } from '@/lib/links'

/**
 * The clickable terracotta domain badge shown next to an idea's text wherever a
 * captured link surfaces (inbox cards, the project overview's founding idea).
 * A `<span role="link">` rather than `<a>` because every caller renders it
 * inside a `<button>` (a nested anchor is invalid HTML); `stopPropagation` lets
 * the link fire without also triggering the surrounding button — same reasoning
 * as `Linkify`.
 */
export function LinkBadge({
  link,
  className = '',
  iconSize = 11,
  label,
}: {
  link: string
  className?: string
  iconSize?: number
  label?: string
}) {
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        openUrl(link)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
          e.preventDefault()
          openUrl(link)
        }
      }}
      className={`inline-flex cursor-pointer items-center gap-0.5 text-terracotta underline-offset-2 hover:underline ${className}`}
    >
      <LinkIcon size={iconSize} /> {domainOf(link)}
    </span>
  )
}
