import { AttachmentThumb } from './AttachmentThumb'
import type { CoverDescriptor } from '@/db/projects'
import { coverDataUrl } from '@/lib/covers'

/**
 * Render a project's resolved cover (see `resolveCover`): a photo via
 * `AttachmentThumb` (so it inherits the inline-thumbnail, blob-fetch and ⤴-badge
 * behaviour), or a built-in default motif as a plain `<img>`. Shared by the Projects
 * list thumbnail and the overview hero so the two surfaces always agree. `className`
 * sizes the image at the call site (e.g. `h-20 w-20 object-cover`).
 */
export function ProjectCover({
  cover,
  className = '',
  alt = '',
  zoomable = false,
  zoomIds,
  zoomIndex,
}: {
  cover: CoverDescriptor
  className?: string
  alt?: string
  /** Photo covers only: tap opens the full-screen viewer (default motifs never zoom). */
  zoomable?: boolean
  zoomIds?: string[]
  zoomIndex?: number
}) {
  if (cover.kind === 'attachment') {
    return (
      <AttachmentThumb
        attachmentId={cover.id}
        uploaded={cover.uploaded}
        className={className}
        alt={alt}
        zoomable={zoomable}
        zoomIds={zoomIds}
        zoomIndex={zoomIndex}
      />
    )
  }
  return <img src={coverDataUrl(cover.key)} alt={alt} className={className} loading="lazy" />
}
