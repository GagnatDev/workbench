import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { writeLocal } from '@/db/sync'
import { generateThumbnail } from '@/lib/thumbnail'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// Module-level guards so concurrent mounts of the same attachment (a list and a
// detail sheet, say) don't fetch or regenerate the same bytes twice.
const fetching = new Set<string>()
const backfilling = new Set<string>()

/**
 * Render a photo attachment.
 *
 * `variant='thumb'` (default, for lists/grids) renders the inline base64
 * thumbnail carried on the synced attachment row — instant on every device, no
 * image request. `variant='full'` (the photo viewer) renders the original.
 *
 * Bytes resolve local-first: the captured original (or a full image we've
 * fetched before) lives in Dexie `blobs` and renders offline. When a photo
 * pulled on another device has no local blob, we fetch `/api/files/:id` once,
 * cache the blob in Dexie, and render from it thereafter — so navigating back
 * and forth no longer re-downloads the rotating presigned URL. Legacy photos
 * without a thumbnail get one generated and synced on first view. An un-uploaded
 * photo carries a small ⤴ badge (ui-ux-design.md §9.1).
 */
export function AttachmentThumb({
  attachmentId,
  uploaded,
  className = '',
  alt,
  variant = 'thumb',
}: {
  attachmentId: string
  uploaded?: boolean
  className?: string
  alt?: string
  variant?: 'thumb' | 'full'
}) {
  const { t } = useTranslation()
  const att = useLiveQuery(() => db.attachments.get(attachmentId), [attachmentId])
  const blobRow = useLiveQuery(() => db.blobs.get(attachmentId), [attachmentId])
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  // Object URL for the local blob (captured original, or a full image we cached).
  useEffect(() => {
    if (!blobRow?.blob) {
      setBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(blobRow.blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blobRow])

  // Thumb view is happy with the inline thumbnail; the full viewer wants the
  // original. Precedence: inline thumb (synced, instant) → local blob.
  const src = variant === 'thumb' ? (att?.thumb ?? blobUrl) : blobUrl

  // No local bytes yet (photo pulled on another device, or a legacy thumb-less
  // photo we must show full): fetch once and cache in Dexie. The blob live-query
  // above then renders it, and it survives navigation, reload, and going offline.
  // Gate on `att` being loaded so the brief undefined window doesn't fetch a
  // photo whose inline thumbnail is about to resolve.
  const needsFetch = !!att && !blobUrl && (variant === 'full' || !att.thumb)
  useEffect(() => {
    if (!needsFetch || fetching.has(attachmentId)) return
    fetching.add(attachmentId)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/files/${attachmentId}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const blob = await res.blob()
        if (!cancelled) await db.blobs.put({ id: attachmentId, blob })
      } catch {
        // Offline or storage disabled — leave it; a later mount retries.
      } finally {
        fetching.delete(attachmentId)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [needsFetch, attachmentId])

  // Backfill the inline thumbnail for legacy photos (thumb === null) once the
  // bytes are local — generated from the cached blob and written back via the
  // normal dirty/sync path so it heals on every device.
  useEffect(() => {
    if (!att || att.thumb != null || !blobRow?.blob || backfilling.has(attachmentId)) return
    const blob = blobRow.blob
    backfilling.add(attachmentId)
    ;(async () => {
      try {
        const thumb = await generateThumbnail(blob)
        if (thumb) await writeLocal('attachments', { ...att, thumb })
      } catch {
        // Ignore; another mount will retry.
      } finally {
        backfilling.delete(attachmentId)
      }
    })()
  }, [att, blobRow, attachmentId])

  return (
    <span className="relative inline-block">
      {src ? (
        <img src={src} alt={alt ?? t('common.photo')} className={className} loading="lazy" />
      ) : (
        // Bytes in flight (or offline with nothing cached): hold the layout box.
        <span className={className} aria-hidden />
      )}
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
