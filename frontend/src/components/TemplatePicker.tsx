import { STAGE_TEMPLATES } from '@/lib/templates'

/**
 * The shared stage-template chip row used by the promote mini-sheet (§3.3) and
 * the new-project sheet (§5). One reusable control so both entry points pick a
 * craft template the same way; the active chip is terracotta (visual-identity.md).
 */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {STAGE_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={
            value === t.id
              ? 'rounded-full bg-terracotta px-3 py-1.5 text-sm text-oatmeal'
              : 'rounded-full bg-oatmeal px-3 py-1.5 text-sm text-charcoal'
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
