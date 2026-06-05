import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { TemplatePicker } from './TemplatePicker'
import { db } from '@/db/db'
import { createProject } from '@/db/projects'
import { DEFAULT_TEMPLATE_ID } from '@/lib/templates'

/**
 * New-project sheet — the Projects-tab ➕ (ui-ux-design.md §5) creates a project
 * directly via the **same mini-sheet as promotion** (§3.3): a title field and a
 * stage-template picker defaulting to the last-used template, nothing more. On
 * confirm it creates the project and navigates into it.
 */
export function NewProjectSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void db._meta.get('lastTemplate').then((row) => {
      if (row?.value) setTemplateId(row.value)
    })
  }, [])

  const create = async () => {
    if (creating) return
    setCreating(true)
    const projectId = await createProject(title, templateId)
    onClose()
    navigate(`/projects/${projectId}`)
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="new-project-title">
      <h2 id="new-project-title" className="mb-3 font-serif text-lg text-charcoal">
        {t('new_project.title')}
      </h2>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('project.title_placeholder')}
        className="w-full rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />

      <div className="mt-4">
        <span className="text-sm text-charcoal-muted">{t('new_project.template')}</span>
        <div className="mt-2">
          <TemplatePicker value={templateId} onChange={setTemplateId} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void create()}
        disabled={creating}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta py-3 text-oatmeal disabled:opacity-60"
      >
        {t('common.create')} <ArrowRight size={18} />
      </button>
    </BottomSheet>
  )
}
