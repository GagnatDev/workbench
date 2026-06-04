import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The shared sheet container. On phones it's a bottom sheet (slides up, grabber,
 * swipe-down to dismiss); at ≥768px it becomes a centered modal (ui-ux-design.md
 * §10 — same component tree, one breakpoint). Dismiss happens on backdrop tap,
 * Escape, or a swipe-down past threshold; the caller's `onClose` decides whether
 * that dismissal *saves* (the capture/composer grammar, §11.1).
 */
export function BottomSheet({
  onClose,
  children,
  labelledBy,
}: {
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const dragStart = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0]!.clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const delta = e.touches[0]!.clientY - dragStart.current
    if (delta > 0) setDragY(delta) // only track downward drag
  }
  const onTouchEnd = () => {
    if (dragY > 90) onClose()
    dragStart.current = null
    setDragY(0)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-charcoal/30"
      />
      <div
        className="relative mx-auto w-full max-w-[680px] rounded-t-2xl bg-stoneware p-4 pb-8 shadow-lg md:max-w-[520px] md:rounded-2xl md:pb-6"
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-divider md:hidden" />
        {children}
      </div>
    </div>
  )
}
