import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, X } from 'lucide-react'

/**
 * Local per-list tag filter (ui-ux-design.md §9.2): a filter icon that reveals a
 * tag-chip row; tapping a chip toggles it into the active set, and active filters
 * stay visible as removable chips even when the picker is closed. AND semantics
 * (see lib/tags.ts). Renders nothing when the list has no tags to offer — filtering
 * is local to each list, so the bar only appears where it can do something.
 *
 * Presentational and self-contained: the owning list keeps the active-tag state
 * and applies `matchesTags` to its own rows.
 */
export function TagFilterBar({
  allTags,
  active,
  onChange,
}: {
  allTags: string[]
  active: string[]
  onChange: (tags: string[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (allTags.length === 0) return null

  const toggle = (tag: string) =>
    onChange(active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag])

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('tags.filter_aria')}
          aria-pressed={open || active.length > 0}
          onClick={() => setOpen((v) => !v)}
          className={
            active.length > 0 || open
              ? 'flex items-center gap-1 text-sm text-terracotta'
              : 'flex items-center gap-1 text-sm text-charcoal-muted hover:text-charcoal'
          }
        >
          <SlidersHorizontal size={16} />
        </button>
        {/* Active filters stay visible even with the picker closed. */}
        {active.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className="inline-flex items-center gap-1 rounded-full bg-terracotta px-2.5 py-0.5 text-sm text-oatmeal"
          >
            #{tag}
            <X size={13} />
          </button>
        ))}
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const on = active.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className={
                  on
                    ? 'rounded-full bg-terracotta px-2.5 py-0.5 text-sm text-oatmeal'
                    : 'rounded-full border border-divider px-2.5 py-0.5 text-sm text-charcoal-muted hover:text-charcoal'
                }
              >
                #{tag}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
