import { animate, motion, type PanInfo, useDragControls, useMotionValue, useTransform } from 'motion/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/lib/motion'
import { SHEET_TOP_GAP, type SheetSnap, sheetVisible, useLayout } from '@/store/layout'

const SNAPS: SheetSnap[] = ['peek', 'half', 'full']
const SPRING = { type: 'spring', stiffness: 380, damping: 40, mass: 0.9 } as const
/** How far a flick carries the sheet past where the finger let go (s of velocity). */
const FLICK = 0.2

/**
 * Phone layout: a bottom sheet over the full-screen map with three snap points. It drags
 * by its header, so the content below scrolls normally at every height. The timeline
 * dock rides on top of the sheet and fades out as the sheet opens fully.
 */
export function MobileSheet({
  header,
  dock,
  children,
}: {
  header: ReactNode
  dock?: ReactNode
  children: ReactNode
}) {
  const vh = useLayout((s) => s.viewportHeight)
  const snap = useLayout((s) => s.snap)
  const setSnap = useLayout((s) => s.setSnap)
  const setDockHeight = useLayout((s) => s.setDockHeight)
  const height = Math.max(0, vh - SHEET_TOP_GAP)
  const offset = (s: SheetSnap) => height - sheetVisible(s, vh)

  const y = useMotionValue(offset(snap))
  const drag = useDragControls()
  const dragged = useRef(false)
  const dockRef = useRef<HTMLDivElement>(null)

  const halfOffset = offset('half')
  const dockOpacity = useTransform(y, [halfOffset * 0.35, halfOffset * 0.85], [0, 1])
  const dockEvents = useTransform(dockOpacity, (o) => (o > 0.6 ? 'auto' : 'none'))

  // Glide to the snap point whenever it (or the screen height) changes.
  useEffect(() => {
    const target = height - sheetVisible(snap, vh)
    if (prefersReducedMotion()) {
      y.set(target)
      return
    }
    const controls = animate(y, target, SPRING)
    return () => controls.stop()
  }, [snap, vh, height, y])

  // The camera frames routes above the dock, so keep its measured height in the store.
  useEffect(() => {
    const el = dockRef.current
    if (!el) return
    // Ignore 0: the dock is empty until a trip is planned, and the camera frames the
    // routes for the dock that appears with them.
    const observer = new ResizeObserver(() => {
      if (el.offsetHeight > 0) setDockHeight(Math.round(el.offsetHeight))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setDockHeight])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const projected = y.get() + info.velocity.y * FLICK
    const nearest = SNAPS.reduce((best, s) =>
      Math.abs(offset(s) - projected) < Math.abs(offset(best) - projected) ? s : best,
    )
    if (nearest === snap) animate(y, offset(nearest), SPRING)
    else setSnap(nearest)
  }

  const cycle = () => setSnap(snap === 'full' ? 'half' : snap === 'half' ? 'full' : 'half')

  return (
    <motion.section
      aria-label="Trip panel"
      drag="y"
      dragListener={false}
      dragControls={drag}
      dragConstraints={{ top: 0, bottom: offset('peek') }}
      dragElastic={0.06}
      dragMomentum={false}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      // Typing needs room above the on-screen keyboard.
      onFocusCapture={(e) => {
        if (e.target instanceof HTMLInputElement && snap !== 'full') setSnap('full')
      }}
      style={{ y, height, ['--sheet-hidden' as string]: `${offset(snap)}px` }}
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[20px] border-t border-line-strong bg-ink-850 shadow-[0_-16px_48px_rgb(0_0_0/0.5)]"
    >
      {dock && (
        <motion.div
          ref={dockRef}
          style={{ opacity: dockOpacity, pointerEvents: dockEvents }}
          className="absolute inset-x-3 bottom-[calc(100%+10px)]"
        >
          {dock}
        </motion.div>
      )}
      <div
        className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          dragged.current = false
          drag.start(e)
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (!dragged.current) cycle()
          }}
          className="mx-auto flex h-5 w-16 items-end justify-center"
          aria-label={snap === 'full' ? 'Collapse trip panel' : 'Expand trip panel'}
          aria-expanded={snap === 'full'}
        >
          <span className="h-1 w-10 rounded-full bg-fg/25" />
        </button>
        {header}
      </div>
      {children}
    </motion.section>
  )
}
