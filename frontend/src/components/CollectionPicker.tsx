import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { allCollections, createCollection } from '@/db/collections'
import { setProjectCollection } from '@/db/projects'
import type { Project } from '@/db/types'

/**
 * Assign a project to a collection (ui-ux-design.md §5 — collections group
 * projects). Lists existing collections (tap to assign, current one checked),
 * "None" to detach, and an inline field to create a new collection on the spot so
 * the first one needn't be made elsewhere.
 */
export function CollectionPicker({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation()
  const collections = useLiveQuery(() => allCollections(), []) ?? []
  const [newName, setNewName] = useState('')

  const assign = (collectionId: string | null) => {
    void setProjectCollection(project, collectionId)
    onClose()
  }

  const createAndAssign = async () => {
    const name = newName.trim()
    if (!name) return
    const id = await createCollection(name)
    assign(id)
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="collection-title">
      <h2 id="collection-title" className="mb-3 font-serif text-lg text-charcoal">
        {t('collection.title')}
      </h2>
      <ul className="flex flex-col">
        <li>
          <button
            type="button"
            onClick={() => assign(null)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left hover:bg-oatmeal"
          >
            <span className="text-charcoal-muted">{t('collection.none')}</span>
            {project.collection_id == null && <Check size={18} className="text-flax" />}
          </button>
        </li>
        {collections.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => assign(c.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left hover:bg-oatmeal"
            >
              <span className="text-charcoal">{c.name}</span>
              {project.collection_id === c.id && <Check size={18} className="text-flax" />}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 border-t border-divider pt-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void createAndAssign()
            }
          }}
          placeholder={t('collection.new_placeholder')}
          className="min-w-0 flex-1 rounded-lg bg-oatmeal p-2 text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <button
          type="button"
          aria-label={t('collection.create_aria')}
          onClick={() => void createAndAssign()}
          disabled={!newName.trim()}
          className="flex-shrink-0 rounded-lg bg-terracotta p-2 text-oatmeal disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>
    </BottomSheet>
  )
}
