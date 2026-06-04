import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * Tag entry as chips with autocomplete from the user's existing tags
 * (ui-ux-design.md §9.2). Tinted-Stoneware chips, Charcoal text — colour never
 * encodes tag meaning (visual-identity.md). Add on Enter or comma; backspace on
 * an empty field removes the last chip.
 */
export function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}) {
  const [input, setInput] = useState('')

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').toLowerCase()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInput('')
  }

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag))

  const matches = input.trim()
    ? suggestions
        .filter((s) => s.includes(input.trim().toLowerCase()) && !tags.includes(s))
        .slice(0, 5)
    : []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-oatmeal px-2.5 py-1 text-sm text-charcoal"
          >
            #{tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => remove(tag)}>
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(input)
            } else if (e.key === 'Backspace' && !input && tags.length) {
              remove(tags[tags.length - 1]!)
            }
          }}
          placeholder={tags.length ? '' : 'Add tags…'}
          className="min-w-[6rem] flex-1 bg-transparent py-1 text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-divider px-2.5 py-0.5 text-sm text-charcoal-muted hover:text-charcoal"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
