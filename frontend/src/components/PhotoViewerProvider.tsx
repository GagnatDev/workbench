import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { PhotoViewer } from './PhotoViewer'

type ViewerState = { ids: string[]; start: number }

const PhotoViewerContext = createContext<((ids: string[], startIndex?: number) => void) | null>(
  null,
)

/**
 * App-wide image lightbox. Any photo surface calls `openViewer(ids, start)` (most
 * via `AttachmentThumb zoomable`) to open the full-screen, zoomable PhotoViewer —
 * so we mount a single viewer here instead of duplicating open/close state at every
 * call site. Mounted once in AppLayout, under the authed shell.
 */
export function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<ViewerState | null>(null)

  const openViewer = useCallback((ids: string[], startIndex = 0) => {
    if (ids.length) setViewer({ ids, start: startIndex })
  }, [])

  // Stable identity so consumers don't re-render when the viewer opens/closes.
  const value = useMemo(() => openViewer, [openViewer])

  return (
    <PhotoViewerContext.Provider value={value}>
      {children}
      {viewer && (
        <PhotoViewer
          attachmentIds={viewer.ids}
          startIndex={viewer.start}
          onClose={() => setViewer(null)}
        />
      )}
    </PhotoViewerContext.Provider>
  )
}

/** Returns `openViewer(ids, startIndex?)`. Throws if used outside the provider. */
export function usePhotoViewer() {
  const ctx = useContext(PhotoViewerContext)
  if (!ctx) throw new Error('usePhotoViewer must be used within a PhotoViewerProvider')
  return ctx
}

/**
 * Like {@link usePhotoViewer} but returns `null` when no provider is mounted instead
 * of throwing — for components (e.g. AttachmentThumb) that also render standalone in
 * tests and degrade to non-zoomable.
 */
export function usePhotoViewerOptional() {
  return useContext(PhotoViewerContext)
}
