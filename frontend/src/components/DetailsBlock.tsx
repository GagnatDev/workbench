import { useState } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { setProjectDetails } from '@/db/projects'
import type { Project } from '@/db/types'

interface Row {
  key: string
  value: string
}

/**
 * The flexible `details` block (ui-ux-design.md §6.3): a compact two-column,
 * free-text key/value list (no types, no unit enforcement — "12 cm" is just a
 * string). Tapping ✎ flips to an editor of label/value pairs with an "Add detail"
 * row. Template-seeded keys arrive empty and **vanish from the read view if left
 * blank** — gentle structure, not a form-builder. Data uses tabular numerals.
 */
export function DetailsBlock({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false)
  const entries = Object.entries(project.details ?? {}).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
  }))
  const filled = entries.filter((e) => e.value.trim())

  if (editing) {
    return (
      <DetailsEditor
        project={project}
        initial={entries}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-base text-charcoal">Details</h3>
        <button
          type="button"
          aria-label="Edit details"
          onClick={() => setEditing(true)}
          className="text-charcoal-muted hover:text-charcoal"
        >
          <Pencil size={16} />
        </button>
      </div>
      {filled.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {filled.map(({ key, value }) => (
            <div key={key} className="contents">
              <dt className="text-charcoal-muted">{key}</dt>
              <dd className="tabular text-charcoal">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-charcoal-muted">No details yet.</p>
      )}
    </div>
  )
}

/** Inline editor: label/value pairs (seeded keys included so they're fillable). */
function DetailsEditor({
  project,
  initial,
  onClose,
}: {
  project: Project
  initial: Row[]
  onClose: () => void
}) {
  // Always offer at least one empty row to type into.
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ key: '', value: '' }])

  const patch = (i: number, field: keyof Row, value: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i))
  const add = () => setRows((r) => [...r, { key: '', value: '' }])

  const save = () => {
    // Keep rows with a label (a blank value is allowed — it just won't display,
    // so a seeded suggestion survives as a fillable hint until used). Last write
    // wins on duplicate keys.
    const details: Record<string, string> = {}
    for (const { key, value } of rows) {
      const k = key.trim()
      if (k) details[k] = value.trim()
    }
    void setProjectDetails(project, details)
    onClose()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-base text-charcoal">Details</h3>
        <button
          type="button"
          aria-label="Done editing details"
          onClick={save}
          className="text-terracotta hover:text-charcoal"
        >
          <Check size={18} />
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input
              value={row.key}
              onChange={(e) => patch(i, 'key', e.target.value)}
              placeholder="Label"
              className="min-w-0 flex-1 rounded-lg bg-oatmeal p-2 text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
            />
            <input
              value={row.value}
              onChange={(e) => patch(i, 'value', e.target.value)}
              placeholder="Value"
              className="tabular min-w-0 flex-1 rounded-lg bg-oatmeal p-2 text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
            />
            <button
              type="button"
              aria-label="Remove detail"
              onClick={() => remove(i)}
              className="p-1 text-charcoal-muted hover:text-brick"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-charcoal-muted hover:text-charcoal"
      >
        <Plus size={15} /> Add detail
      </button>
    </div>
  )
}
