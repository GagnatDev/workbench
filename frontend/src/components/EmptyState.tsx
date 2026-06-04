import { type ReactNode } from 'react'

/**
 * Empty states teach (ui-ux-design.md §9.3): a single line of muted text plus at
 * most one terracotta action. No illustrations (visual-identity.md).
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-charcoal">{title}</p>
      {hint && <p className="max-w-xs text-sm text-charcoal-muted">{hint}</p>}
      {action}
    </div>
  )
}
