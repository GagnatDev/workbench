import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { BottomSheet } from './BottomSheet'
import { TagInput } from './TagInput'
import { allProjectTags, updateProject } from '@/db/projects'
import type { Project } from '@/db/types'

/**
 * Edit a project's title, description, and tags. Follows the dismiss-saves grammar
 * of the idea detail sheet (§11.1) — no Save button; closing persists any change.
 * Stages, status, collection, and details have their own dedicated affordances on
 * the overview, so this sheet stays to the free-text fields plus tagging (§9.2).
 */
export function EditProjectSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description ?? '')
  const [tags, setTags] = useState<string[]>(project.tags ?? [])
  const suggestions = useLiveQuery(() => allProjectTags(), []) ?? []

  const latest = useRef({ title, description, tags })
  latest.current = { title, description, tags }

  const save = async () => {
    const { title: t, description: d, tags: tg } = latest.current
    const patch: Partial<Pick<Project, 'title' | 'description' | 'tags'>> = {}
    const trimmedTitle = t.trim()
    if (trimmedTitle && trimmedTitle !== project.title) patch.title = trimmedTitle
    if ((d.trim() || null) !== (project.description ?? null)) patch.description = d.trim() || null
    if (JSON.stringify(tg) !== JSON.stringify(project.tags ?? [])) patch.tags = tg
    if (Object.keys(patch).length) await updateProject(project, patch)
  }

  // Save if the sheet unmounts some other way (route change, etc.).
  useEffect(() => () => void save(), [])

  const closeWithSave = () => {
    void save()
    onClose()
  }

  return (
    <BottomSheet onClose={closeWithSave} labelledBy="edit-project-title">
      <h2 id="edit-project-title" className="mb-3 font-serif text-lg text-charcoal">
        {t('project.edit')}
      </h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('project.title_placeholder')}
        className="w-full rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />
      <textarea
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('project.description_placeholder')}
        className="mt-2 w-full resize-none rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />
      <div className="mt-3">
        <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>
    </BottomSheet>
  )
}
