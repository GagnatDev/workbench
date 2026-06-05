import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Render a photo attachment. Local-first: if the original blob is still in Dexie
 * (always true before upload, and kept after so the workshop phone renders
 * offline) we show that; otherwise we fall back to the backend's presigned GET
 * (`/api/files/:id`, same-origin so the SSO cookie rides along). An un-uploaded
 * photo carries a small ⤴ badge (ui-ux-design.md §9.1).
 */
export function AttachmentThumb({
  attachmentId,
  uploaded,
  className = '',
  alt,
}: {
  attachmentId: string
  uploaded?: boolean
  className?: string
  alt?: string
}) {
  const { t } = useTranslation()
  const blobRow = useLiveQuery(() => db.blobs.get(attachmentId), [attachmentId])
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blobRow?.blob) {
      setBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(blobRow.blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blobRow])

  const src = blobUrl ?? `${API_BASE}/api/files/${attachmentId}`

  return (
    <span className="relative inline-block">
      <img src={src} alt={alt ?? t('common.photo')} className={className} loading="lazy" />
      {uploaded === false && (
        <span
          aria-label={t('attachment.not_uploaded_aria')}
          title={t('attachment.queued_title')}
          className="absolute right-1 top-1 rounded-full bg-charcoal/70 px-1 text-[10px] leading-4 text-oatmeal"
        >
          ⤴
        </span>
      )}
    </span>
  )
}
