import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AttachmentThumb } from './AttachmentThumb'

/**
 * Full-screen photo viewer (ui-ux-design.md §12 #17): a dark overlay over a single
 * attachment, with prev/next to swipe between a set of pins (moodboard) or an
 * entry's photo strip (journal). Arrow keys and Escape work for desktop; the image
 * keeps its natural aspect ratio (cropping references defeats the point, §7.2).
 */
export function PhotoViewer({
  attachmentIds,
  startIndex = 0,
  onClose,
}: {
  attachmentIds: string[]
  startIndex?: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(startIndex)
  const count = attachmentIds.length
  const clamp = (i: number) => (i + count) % count

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIndex((i) => clamp(i - 1))
      else if (e.key === 'ArrowRight') setIndex((i) => clamp(i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  if (count === 0) return null
  const id = attachmentIds[clamp(index)]!

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/90"
      role="dialog"
      aria-modal="true"
      aria-label={t('photo_viewer.dialog_aria')}
    >
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal/60 text-oatmeal"
      >
        <X size={22} />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label={t('photo_viewer.previous')}
            onClick={() => setIndex((i) => clamp(i - 1))}
            className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal/60 text-oatmeal"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            aria-label={t('photo_viewer.next')}
            onClick={() => setIndex((i) => clamp(i + 1))}
            className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal/60 text-oatmeal"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <AttachmentThumb
        key={id}
        attachmentId={id}
        className="max-h-[90vh] max-w-[92vw] object-contain"
        alt={t('common.photo')}
      />
    </div>
  )
}
