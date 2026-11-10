import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 6
export const ZOOM_STEP = 1.25
/** Space (px) kept clear around the drawing when it's fitted to the canvas. */
export const MARGIN = 56
/** A press that moves further than this (px) pans the drawing instead of clicking. */
const DRAG_THRESHOLD = 4
/** How much one pixel of wheel movement zooms; a mouse wheel notch is about 100 px. */
const WHEEL_ZOOM = 0.0015

/** How far in the drawing is zoomed, and where it's moved to (px from the middle of the canvas). */
export interface View {
  zoom: number
  x: number
  y: number
}

export const FITTED: View = { zoom: 1, x: 0, y: 0 }

/** Zooms by `factor`, keeping the point `about` (px from the middle of the canvas) where it is. */
export function zoomView(view: View, factor: number, about = { x: 0, y: 0 }): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
  const applied = zoom / view.zoom
  return { zoom, x: about.x - (about.x - view.x) * applied, y: about.y - (about.y - view.y) * applied }
}

/** The element's layout size (unaffected by CSS transforms), kept up to date. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Zooming and moving a drawing on a canvas: the wheel zooms about the pointer and dragging moves
 * it. Clicks that end a drag are ignored, through `unlessDragged`.
 */
export function usePanZoom() {
  const [viewport, size] = useSize<HTMLDivElement>()
  const [view, setView] = useState<View>(FITTED)
  const drag = useRef<{ pointer: number; x: number; y: number; view: View; moved: boolean } | null>(null)
  const dragged = useRef(false)

  // React's wheel events can't stop the page scrolling, so this listens directly.
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = element.getBoundingClientRect()
      const pixels = e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? box.height : 1)
      const about = { x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 }
      setView((v) => zoomView(v, Math.exp(-pixels * WHEEL_ZOOM), about))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [viewport])

  /** Pointer handlers for the canvas, given the drawing's size on screen (px). */
  const pointerHandlers = (drawingWidth: number, drawingHeight: number) => {
    const end = () => {
      // A pan ends with a click on whatever is under the pointer; ignore that one.
      dragged.current = drag.current?.moved ?? false
      drag.current = null
    }
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        dragged.current = false
        drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, view, moved: false }
      },
      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
        const start = drag.current
        if (!start || start.pointer !== e.pointerId) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (!start.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        if (!start.moved) {
          start.moved = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        // Keep part of the drawing in view.
        const limitX = drawingWidth / 2 + size.width / 2 - MARGIN
        const limitY = drawingHeight / 2 + size.height / 2 - MARGIN
        setView({
          zoom: start.view.zoom,
          x: Math.max(-limitX, Math.min(limitX, start.view.x + dx)),
          y: Math.max(-limitY, Math.min(limitY, start.view.y + dy)),
        })
      },
      onPointerUp: end,
      onPointerCancel: end,
    }
  }

  const unlessDragged = (action: () => void) => () => {
    if (dragged.current) dragged.current = false
    else action()
  }

  return { viewport, size, view, setView, pointerHandlers, unlessDragged }
}
