import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AttachmentThumb } from './AttachmentThumb'

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const DOUBLE_TAP_MS = 300

/**
 * Full-screen photo viewer (ui-ux-design.md §12 #17): a dark overlay over a single
 * attachment, with prev/next to swipe between a set of pins (moodboard) or an
 * entry's photo strip (journal). Arrow keys and Escape work for desktop; the image
 * keeps its natural aspect ratio (cropping references defeats the point, §7.2).
 *
 * Because page zoom is disabled app-wide (index.html viewport), this is the place to
 * inspect a photo up close: pinch to zoom, double-tap to toggle, drag to pan, and
 * scroll-wheel to zoom on desktop. Zoom resets when navigating to another photo.
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

  // Zoom/pan state. (tx, ty) are screen-pixel translations applied around the
  // image's center; scale is the zoom factor.
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  const stageRef = useRef<HTMLDivElement>(null)
  // Active pointers (id → current position) drive pan (1 pointer) and pinch (2).
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ startDist: 0, startScale: 1, startMidX: 0, startMidY: 0, startTx: 0, startTy: 0 })
  const lastTap = useRef({ time: 0, x: 0, y: 0 })

  const resetZoom = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  // Reset zoom whenever the active photo changes (navigation or initial open).
  useEffect(() => resetZoom(), [index, resetZoom])

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // Clamp a pan offset so the zoomed image can't be dragged entirely off-screen.
  // object-contain keeps the image within the stage, so half the extra size is a
  // good-enough bound on either axis.
  const clampPan = useCallback((x: number, y: number, s: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    const maxX = rect ? ((s - 1) * rect.width) / 2 : 0
    const maxY = rect ? ((s - 1) * rect.height) / 2 : 0
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }, [])

  const zoomToPoint = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      const s = Math.max(1, Math.min(MAX_SCALE, nextScale))
      if (s <= 1.001) {
        resetZoom()
        return
      }
      // Move the tapped content point to the stage center.
      const dx = clientX - (rect.left + rect.width / 2)
      const dy = clientY - (rect.top + rect.height / 2)
      const { x, y } = clampPan(-s * dx, -s * dy, s)
      setScale(s)
      setTx(x)
      setTy(y)
    },
    [clampPan, resetZoom],
  )

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y)

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]

    if (pts.length === 2) {
      gesture.current = {
        startDist: dist(pts[0]!, pts[1]!),
        startScale: scale,
        startMidX: (pts[0]!.x + pts[1]!.x) / 2,
        startMidY: (pts[0]!.y + pts[1]!.y) / 2,
        startTx: tx,
        startTy: ty,
      }
      return
    }

    // Single pointer: detect a double-tap, else begin a pan baseline.
    const now = Date.now()
    const isDouble =
      now - lastTap.current.time < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 30
    if (isDouble) {
      lastTap.current = { time: 0, x: 0, y: 0 }
      zoomToPoint(e.clientX, e.clientY, scale > 1.001 ? 1 : DOUBLE_TAP_SCALE)
      return
    }
    lastTap.current = { time: now, x: e.clientX, y: e.clientY }
    gesture.current = { ...gesture.current, startTx: tx, startTy: ty, startMidX: e.clientX, startMidY: e.clientY }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]

    if (pts.length === 2) {
      const g = gesture.current
      const ratio = dist(pts[0]!, pts[1]!) / (g.startDist || 1)
      const s = Math.max(1, Math.min(MAX_SCALE, g.startScale * ratio))
      const midX = (pts[0]!.x + pts[1]!.x) / 2
      const midY = (pts[0]!.y + pts[1]!.y) / 2
      const { x, y } = clampPan(g.startTx + (midX - g.startMidX), g.startTy + (midY - g.startMidY), s)
      setScale(s)
      setTx(x)
      setTy(y)
      return
    }

    if (pts.length === 1 && scale > 1.001) {
      const g = gesture.current
      const { x, y } = clampPan(g.startTx + (e.clientX - g.startMidX), g.startTy + (e.clientY - g.startMidY), scale)
      setTx(x)
      setTy(y)
    }
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const pts = [...pointers.current.values()]
    // Dropping from pinch to one finger: rebase the pan from the survivor.
    if (pts.length === 1) {
      gesture.current = { ...gesture.current, startTx: tx, startTy: ty, startMidX: pts[0]!.x, startMidY: pts[0]!.y }
    }
    if (pts.length === 0 && scale <= 1.001) resetZoom()
  }

  // Wheel zoom (desktop). Attached natively so we can preventDefault (React's
  // onWheel is passive). Zooms toward the cursor.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.002)
      zoomToPoint(e.clientX, e.clientY, scale * factor)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [scale, zoomToPoint])

  if (count === 0) return null
  const id = attachmentIds[clamp(index)]!
  const zoomed = scale > 1.001

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-charcoal/90"
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
            onClick={() => go(-1)}
            className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal/60 text-oatmeal"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            aria-label={t('photo_viewer.next')}
            onClick={() => go(1)}
            className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-charcoal/60 text-oatmeal"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <div
        ref={stageRef}
        className={`flex h-full w-full touch-none select-none items-center justify-center ${
          zoomed ? 'cursor-grab' : 'cursor-zoom-in'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDragStart={(e) => e.preventDefault()}
      >
        <AttachmentThumb
          key={id}
          attachmentId={id}
          variant="full"
          className="max-h-[90vh] max-w-[92vw] object-contain"
          alt={t('common.photo')}
          imgStyle={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        />
      </div>
    </div>
  )
}
