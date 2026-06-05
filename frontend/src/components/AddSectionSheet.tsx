import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Image, ListChecks, Package } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { createSection, defaultSectionName, SECTION_KINDS } from '@/db/sections'
import type { SectionKind } from '@/db/payload'

const KIND_ICON: Record<SectionKind, typeof BookOpen> = {
  journal: BookOpen,
  moodboard: Image,
  checklist: ListChecks,
  materials: Package,
}

/**
 * Add-section sheet (ui-ux-design.md §6.1 — sections are added from the overview,
 * kind chosen + named). Pick a kind (defaults the name to the kind's label, so a
 * tap-through still produces a sensible "Journal"), optionally rename, create. On
 * create it drops you into the new section so you can start using it immediately.
 */
export function AddSectionSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [kind, setKind] = useState<SectionKind>('journal')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (creating) return
    setCreating(true)
    const id = await createSection(projectId, kind, name)
    onClose()
    navigate(`/projects/${projectId}/sections/${id}`)
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="add-section-title">
      <h2 id="add-section-title" className="mb-3 font-serif text-lg text-charcoal">
        {t('project.add_section')}
      </h2>

      <div className="grid grid-cols-2 gap-2">
        {SECTION_KINDS.map(({ kind: k }) => {
          const Icon = KIND_ICON[k]
          const active = k === kind
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex items-center gap-2 rounded-lg px-3 py-3 text-left ${
                active ? 'bg-terracotta text-oatmeal' : 'bg-oatmeal text-charcoal'
              }`}
            >
              <Icon size={18} /> {t(`section_kind.${k}`)}
            </button>
          )
        })}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={defaultSectionName(kind)}
        className="mt-4 w-full rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />

      <button
        type="button"
        onClick={() => void create()}
        disabled={creating}
        className="mt-5 w-full rounded-lg bg-terracotta py-3 text-oatmeal disabled:opacity-60"
      >
        {t('add_section.create')}
      </button>
    </BottomSheet>
  )
}
