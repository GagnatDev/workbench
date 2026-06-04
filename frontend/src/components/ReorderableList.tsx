import { useRef, useState, type ReactNode } from 'react'
import { rankBetween } from '@/lib/rank'

/** The minimum a row must carry to be reorderable: a stable id and a sort rank. */
export interface Ranked {
  id: string
  rank: string
}

const LONG_PRESS_MS = 220
const SCROLL_SLOP = 8

/**
 * A vertical list with **long-press to drag** reordering (ui-ux-design.md §8 —
 * the one ordering gesture, used for sections on the project overview and items
 * within a section). A press that moves before the hold delay is a scroll and is
 * left alone; once the drag lifts (haptic tick), the row follows the finger and
 * its neighbours part to make room. On drop it computes a **fractional rank
 * strictly between the new neighbours** (rank.ts) and hands it back via
 * `onReorder` — insert-between, no renumbering, safe under offline LWW sync.
 *
 * Pointer-based, so it works with mouse too; rows that aren't dragging keep their
 * normal tap/click behaviour.
 */
export function ReorderableList<T extends Ranked>({
  items,
  onReorder,
  renderItem,
  className,
  rowClassName,
}: {
  items: T[]
  onReorder: (item: T, newRank: string) => void
  renderItem: (item: T) => ReactNode
  className?: string
  rowClassName?: string
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [dy, setDy] = useState(0)

  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const startY = useRef(0)
  const rowHeight = useRef(0)
  // True once a drag has lifted, so the click that follows pointerup is swallowed
  // (a long-press-drag must not also navigate the row's link / fire its tap).
  const dragSession = useRef(false)
  const dragging = dragIndex !== null

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = undefined
  }

  const beginDrag = (index: number) => {
    rowHeight.current = rowRefs.current[index]?.getBoundingClientRect().height ?? 0
    dragSession.current = true
    setDragIndex(index)
    setOverIndex(index)
    setDy(0)
    navigator.vibrate?.(10) // haptic tick on lift (§8)
  }

  const onPointerDown = (index: number) => (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return
    startY.current = e.clientY
    dragSession.current = false // a fresh press is a tap until the hold fires
    clearPress()
    pressTimer.current = setTimeout(() => beginDrag(index), LONG_PRESS_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) {
      // Still in the hold window — a real move means the user is scrolling.
      if (pressTimer.current && Math.abs(e.clientY - startY.current) > SCROLL_SLOP) clearPress()
      return
    }
    e.preventDefault()
    const delta = e.clientY - startY.current
    setDy(delta)
    // Where the dragged row's centre now sits, in row-height steps from its start.
    const steps = rowHeight.current ? Math.round(delta / rowHeight.current) : 0
    const target = Math.max(0, Math.min(items.length - 1, dragIndex! + steps))
    setOverIndex(target)
  }

  const finishDrag = () => {
    if (dragIndex === null || overIndex === null) {
      clearPress()
      setDragIndex(null)
      return
    }
    const from = dragIndex
    const to = overIndex
    setDragIndex(null)
    setOverIndex(null)
    setDy(0)
    if (from === to) return

    // The order after the move, so we can read the dragged row's new neighbours.
    const reordered = [...items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved!)
    const prev = reordered[to - 1]?.rank ?? null
    const next = reordered[to + 1]?.rank ?? null
    onReorder(moved!, rankBetween(prev, next))
  }

  const onPointerUp = () => {
    clearPress()
    finishDrag()
  }

  /**
   * The vertical offset to show for each row: the dragged row follows the finger;
   * the rows it has passed shift by one row-height to open the drop gap.
   */
  const offsetFor = (index: number): number => {
    if (!dragging) return 0
    if (index === dragIndex) return dy
    const h = rowHeight.current
    if (dragIndex! < overIndex! && index > dragIndex! && index <= overIndex!) return -h
    if (dragIndex! > overIndex! && index < dragIndex! && index >= overIndex!) return h
    return 0
  }

  return (
    <ul
      className={className}
      onPointerMove={onPointerMove}
      onClickCapture={(e) => {
        // Swallow the click that trails a drag's pointerup (don't navigate/tap).
        if (dragSession.current) {
          e.preventDefault()
          e.stopPropagation()
          dragSession.current = false
        }
      }}
    >
      {items.map((item, index) => {
        const isDragged = index === dragIndex
        return (
          <li
            key={item.id}
            ref={(el) => {
              rowRefs.current[index] = el
            }}
            onPointerDown={onPointerDown(index)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={rowClassName}
            style={{
              transform: offsetFor(index) ? `translateY(${offsetFor(index)}px)` : undefined,
              transition: isDragged ? 'none' : 'transform 150ms ease',
              touchAction: dragging ? 'none' : 'pan-y',
              zIndex: isDragged ? 10 : undefined,
              position: isDragged ? 'relative' : undefined,
              opacity: isDragged ? 0.85 : undefined,
            }}
          >
            {renderItem(item)}
          </li>
        )
      })}
    </ul>
  )
}
