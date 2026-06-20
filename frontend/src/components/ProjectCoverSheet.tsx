import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ImagePlus, Wand2 } from 'lucide-react'
import { AttachmentThumb } from './AttachmentThumb'
import { BottomSheet } from './BottomSheet'
import { addProjectCoverPhoto, projectPhotos, setProjectCover } from '@/db/projects'
import type { Project } from '@/db/types'
import { coverDataUrl, DEFAULT_COVERS } from '@/lib/covers'

/**
 * Choose a project's main image (the list thumbnail + overview hero). Offers
 * "Automatic" (fall back to the founding photo or a default motif), the built-in
 * default motifs, every photo already under the project (promoted-idea / item /
 * uploaded), and an upload-a-new-photo button. Picking only re-points `project.cover`
 * (see `setProjectCover`), so prior images are never lost.
 */
export function ProjectCoverSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation()
  const photos = useLiveQuery(() => projectPhotos(project.id), [project.id]) ?? []
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const choose = (cover: string | null) => {
    void setProjectCover(project, cover)
    onClose()
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setBusy(true)
    try {
      await addProjectCoverPhoto(project, file)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const isDefault = (key: string) => project.cover === `default:${key}`
  const isPhoto = (id: string) => project.cover === `att:${id}`

  return (
    <BottomSheet onClose={onClose} labelledBy="cover-title">
      <h2 id="cover-title" className="mb-3 font-serif text-lg text-charcoal">
        {t('cover.title')}
      </h2>

      <button
        type="button"
        onClick={() => choose(null)}
        className="mb-4 flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left hover:bg-oatmeal"
      >
        <span className="flex items-center gap-2 text-charcoal">
          <Wand2 size={16} className="text-charcoal-muted" />
          {t('cover.automatic')}
        </span>
        {project.cover == null && <Check size={18} className="text-flax" />}
      </button>

      <p className="mb-2 text-xs uppercase tracking-wide text-charcoal-muted">{t('cover.defaults')}</p>
      <ul className="grid grid-cols-4 gap-2">
        {DEFAULT_COVERS.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              aria-label={t(`cover.motif.${c.key}`)}
              aria-pressed={isDefault(c.key)}
              onClick={() => choose(`default:${c.key}`)}
              className={`relative block aspect-square w-full overflow-hidden rounded-lg ${
                isDefault(c.key) ? 'ring-2 ring-terracotta' : ''
              }`}
            >
              <img src={coverDataUrl(c.key)} alt="" className="h-full w-full object-cover" />
              {isDefault(c.key) && <SelectedBadge />}
            </button>
          </li>
        ))}
      </ul>

      {photos.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-charcoal-muted">
            {t('cover.from_project')}
          </p>
          <ul className="grid grid-cols-4 gap-2">
            {photos.map((att) => (
              <li key={att.id}>
                <button
                  type="button"
                  aria-label={t('cover.use_photo_aria')}
                  aria-pressed={isPhoto(att.id)}
                  onClick={() => choose(`att:${att.id}`)}
                  className={`relative block aspect-square w-full overflow-hidden rounded-lg ${
                    isPhoto(att.id) ? 'ring-2 ring-terracotta' : ''
                  }`}
                >
                  <AttachmentThumb
                    attachmentId={att.id}
                    uploaded={att.uploaded}
                    className="h-full w-full object-cover"
                    alt=""
                  />
                  {isPhoto(att.id) && <SelectedBadge />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta py-2.5 text-oatmeal disabled:opacity-40"
      >
        <ImagePlus size={18} />
        {busy ? t('cover.uploading') : t('cover.upload')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPickFile(e)}
      />
    </BottomSheet>
  )
}

function SelectedBadge() {
  return (
    <span className="absolute right-1 top-1 rounded-full bg-terracotta p-0.5 text-oatmeal">
      <Check size={12} />
    </span>
  )
}
