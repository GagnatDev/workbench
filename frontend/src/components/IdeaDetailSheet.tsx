import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, FolderPlus, Inbox as InboxIcon, Trash2 } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { TagInput } from './TagInput'
import { AttachmentThumb } from './AttachmentThumb'
import { db } from '@/db/db'
import { allIdeaTags, deleteIdea, setIdeaState, updateIdea } from '@/db/ideas'
import type { Idea } from '@/db/types'

/**
 * Idea detail sheet (ui-ux-design.md §3.2) — the slower triage actions behind a
 * tap: edit text/link, tag (autocomplete §9.2), Keep, Archive, Delete, and
 * Promote. Edits save on dismiss (the §11.1 grammar: no Save button); the action
 * buttons apply immediately and close. Editing/removing the photo is deferred —
 * capture is the photo path in Phase 3.
 */
export function IdeaDetailSheet({
  idea,
  onClose,
  onPromote,
}: {
  idea: Idea
  onClose: () => void
  onPromote: (idea: Idea) => void
}) {
  const { t } = useTranslation()
  const [content, setContent] = useState(idea.content)
  const [link, setLink] = useState(idea.link ?? '')
  const [tags, setTags] = useState<string[]>(idea.tags ?? [])
  const suggestions = useLiveQuery(() => allIdeaTags(), []) ?? []

  const photo = useLiveQuery(async () => {
    const atts = await db.attachments.where('owner_id').equals(idea.id).toArray()
    return atts.find((a) => !a.deleted && a.owner_type === 'idea')
  }, [idea.id])

  // Snapshot the latest edits so the dismiss-saves handler doesn't go stale.
  const latest = useRef({ content, link, tags })
  latest.current = { content, link, tags }

  const saveEdits = async () => {
    const { content: c, link: l, tags: t } = latest.current
    const changed =
      c !== idea.content ||
      (l || null) !== (idea.link ?? null) ||
      JSON.stringify(t) !== JSON.stringify(idea.tags ?? [])
    if (changed) {
      await updateIdea(idea, { content: c.trim(), link: l.trim() || null, tags: t })
    }
  }

  const closeWithSave = () => {
    void saveEdits()
    onClose()
  }

  // Save edits if the sheet unmounts some other way (route change, etc.).
  useEffect(() => () => void saveEdits(), [])

  const act = async (fn: () => Promise<void>) => {
    await saveEdits()
    await fn()
    onClose()
  }

  return (
    <BottomSheet onClose={closeWithSave} labelledBy="idea-detail">
      <h2 id="idea-detail" className="sr-only">
        {t('idea.detail_title')}
      </h2>

      {photo && (
        <AttachmentThumb
          attachmentId={photo.id}
          uploaded={photo.uploaded}
          className="mb-3 max-h-48 rounded-lg object-cover"
        />
      )}

      <textarea
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('idea.placeholder')}
        className="w-full resize-none rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />
      <input
        type="url"
        inputMode="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder={t('idea.link_placeholder')}
        className="mt-2 w-full rounded-lg bg-oatmeal p-2 text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />

      <div className="mt-3">
        <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
        <button
          type="button"
          onClick={() => onPromote(idea)}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-terracotta py-3 text-oatmeal"
        >
          <FolderPlus size={18} /> {t('idea.promote')}
        </button>
        {idea.state === 'kept' ? (
          <button
            type="button"
            onClick={() => void act(() => setIdeaState(idea, 'captured'))}
            className="flex items-center justify-center gap-2 rounded-lg bg-oatmeal py-2.5 text-charcoal"
          >
            <InboxIcon size={16} /> {t('idea.move_to_new')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void act(() => setIdeaState(idea, 'kept'))}
            className="flex items-center justify-center gap-2 rounded-lg bg-oatmeal py-2.5 text-charcoal"
          >
            <InboxIcon size={16} /> {t('idea.keep')}
          </button>
        )}
        <button
          type="button"
          onClick={() => void act(() => setIdeaState(idea, 'archived'))}
          className="flex items-center justify-center gap-2 rounded-lg bg-oatmeal py-2.5 text-charcoal"
        >
          <Archive size={16} /> {t('idea.archive')}
        </button>
        <button
          type="button"
          onClick={() => void act(() => deleteIdea(idea.id))}
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg py-2.5 text-brick"
        >
          <Trash2 size={16} /> {t('common.delete')}
        </button>
      </div>
    </BottomSheet>
  )
}
