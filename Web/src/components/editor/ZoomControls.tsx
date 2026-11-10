import { FITTED, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, zoomView, type View } from './panZoom'

/** Zoom out, the zoom level, zoom in and fit, in the canvas's bottom-right corner. */
export function ZoomControls({ view, onChange }: { view: View; onChange: (update: (view: View) => View) => void }) {
  return (
    <div className="canvas-zoom">
      <button className="canvas-zoom-button" aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM} onClick={() => onChange((v) => zoomView(v, 1 / ZOOM_STEP))}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12 H19" />
        </svg>
      </button>
      <span className="canvas-zoom-level">{Math.round(view.zoom * 100)}%</span>
      <button className="canvas-zoom-button" aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => onChange((v) => zoomView(v, ZOOM_STEP))}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5 V19" />
          <path d="M5 12 H19" />
        </svg>
      </button>
      <button className="canvas-zoom-button" aria-label="Fit to screen" disabled={view === FITTED} onClick={() => onChange(() => FITTED)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9 V4 H9" />
          <path d="M15 4 H20 V9" />
          <path d="M20 15 V20 H15" />
          <path d="M9 20 H4 V15" />
        </svg>
      </button>
    </div>
  )
}
