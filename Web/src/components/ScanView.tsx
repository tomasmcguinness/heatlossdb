import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { alignmentOf, effectiveRole, storeyName, useFabric } from '../fabric/store'
import { floorPlans, type FloorPlan } from '../scan/plan'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.5

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
const squareMetres = (area: number) => `${area < 10 ? area.toFixed(1) : Math.round(area)} m²`

const icon = (paths: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
)

interface View {
  zoom: number
  /** Where the middle of the view is, as a fraction of the plan's width and height. */
  x: number
  y: number
}

const FIT: View = { zoom: 1, x: 0.5, y: 0.5 }

interface Bounds {
  minX: number
  minZ: number
  width: number
  depth: number
}

/** The simple floor plan viewer: one storey at a time, its rooms, and what to do next. */
export function ScanView({ stored, onBack }: { stored: boolean; onBack: () => void }) {
  const scan = useFabric((s) => s.scan)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const alignment = useFabric((s) => s.alignment)
  const [storyIndex, setStoryIndex] = useState(0)

  const plans = useMemo(() => (scan ? floorPlans(scan, (story) => alignmentOf({ alignment }, story)) : []), [scan, alignment])

  if (!scan || !plans.length) return null
  const plan = plans[Math.min(storyIndex, plans.length - 1)]
  // Every floor is drawn within the bounds of them all, so they share a scale and each sits
  // where it is over the one below.
  const all = plans.flatMap((p) => p.outlines.flat())
  const minX = Math.min(...all.map((p) => p[0]))
  const minZ = Math.min(...all.map((p) => p[1]))
  const bounds: Bounds = {
    minX,
    minZ,
    width: Math.max(...all.map((p) => p[0])) - minX,
    depth: Math.max(...all.map((p) => p[1])) - minZ,
  }
  const roleOf = (id: string) => effectiveRole({ elements, autoRoles, byId }, id)
  const rooms = plans.reduce((total, p) => total + p.rooms.length, 0)
  const area = plans.reduce((total, p) => total + p.area, 0)
  const height = plans.reduce((total, p) => total + p.wallHeight, 0) / plans.length
  const floorName = storeyName(scan.stories, plan.story)

  return (
    <main className="scan-view">
      <div className="scan-view-head">
        <div className="scan-view-title">
          <button className="link back-link" onClick={onBack}>
            {icon(
              <>
                <path d="M19 12 H5" />
                <path d="M11 6 L5 12 L11 18" />
              </>,
              16,
            )}
            Back to options
          </button>
          <h1>Your scan</h1>
        </div>
        <p className="viewing-only">
          {icon(
            <>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" />
            </>,
          )}
          {stored ? 'Viewing only. Nothing you do here is saved.' : 'Viewing only. Your scan stays in this browser.'}
        </p>
      </div>

      <div className="scan-view-body">
        <section className="card plan-card" aria-label="Floor plan">
          <PlanViewer
            plan={plan}
            bounds={bounds}
            isExternal={(id) => roleOf(id) !== 'internal'}
            floors={
              plans.length > 1 && (
                <div className="floor-tabs" role="tablist" aria-label="Floors">
                  {plans.map((p, i) => (
                    <button key={p.story} role="tab" aria-selected={p === plan} className={p === plan ? 'on' : ''} onClick={() => setStoryIndex(i)}>
                      {storeyName(scan.stories, p.story)}
                    </button>
                  ))}
                </div>
              )
            }
          />
        </section>

        <aside className="scan-view-side">
          <section className="card" aria-labelledby="details-title">
            <h2 id="details-title">Scan details</h2>
            <dl className="scan-facts">
              <div>
                <dt>Floors</dt>
                <dd>{plans.length}</dd>
              </div>
              <div>
                <dt>Rooms</dt>
                <dd>{rooms || '–'}</dd>
              </div>
              <div>
                <dt>Floor area</dt>
                <dd>{Math.round(area)} m²</dd>
              </div>
              <div>
                <dt>Avg. ceiling height</dt>
                <dd>{height.toFixed(1)} m</dd>
              </div>
            </dl>
            <h3 className="room-list-title">{floorName} rooms</h3>
            {plan.rooms.length ? (
              <ul className="room-list">
                {plan.rooms.map((room, i) => (
                  <li key={i}>
                    <span>{room.name}</span>
                    <span className="muted">{room.area === null ? '–' : squareMetres(room.area)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">The scan didn’t name any rooms on this floor.</p>
            )}
          </section>

          <section className="card do-more" aria-labelledby="more-title">
            <div className="do-more-intro">
              <h2 id="more-title">Do more with your scan</h2>
              <p className="muted">Each of these starts with a few questions about your home.</p>
            </div>
            {/* Share comes next; until it exists the option is shown but can't be chosen. */}
            <button className="more-option primary" disabled>
              <span className="more-option-icon">
                {icon(
                  <>
                    <path d="M3 11 L12 3.5 L21 11" />
                    <path d="M5.5 9 V20.5 H18.5 V9" />
                    <path d="M12 17 V10.5" />
                    <path d="M9.25 13 L12 10.25 L14.75 13" />
                  </>,
                  22,
                )}
              </span>
              <span className="more-option-text">
                <span className="more-option-title">Share your home</span>
                <span className="small muted">Free account required</span>
              </span>
              {icon(<path d="M9 6 L15 12 L9 18" />)}
            </button>
            <ComingSoon
              title="Find similar homes"
              icon={icon(
                <>
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="M15.5 15.5 L21 21" />
                  <path d="M7.5 11 L10.5 8.5 L13.5 11 V13.5 H7.5 Z" />
                </>,
                22,
              )}
            />
            <ComingSoon
              title="Explore the database"
              icon={icon(
                <>
                  <path d="M3 6.5 L9 4 L15 6.5 L21 4 V17.5 L15 20 L9 17.5 L3 20 Z" />
                  <path d="M9 4 V17.5" />
                  <path d="M15 6.5 V20" />
                </>,
                22,
              )}
            />
          </section>
        </aside>
      </div>
    </main>
  )
}

function ComingSoon({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="more-option coming-soon" aria-disabled="true">
      <span className="more-option-icon">{icon}</span>
      <span className="more-option-text">
        <span className="more-option-title">{title}</span>
        <span className="small muted">Opens once enough homes are shared</span>
        <span className="badge badge-soon">Coming soon</span>
      </span>
    </div>
  )
}

function PlanViewer({
  plan,
  bounds,
  isExternal,
  floors,
}: {
  plan: FloorPlan
  bounds: Bounds
  isExternal: (id: string) => boolean
  floors: ReactNode
}) {
  const [view, setView] = useState<View>(FIT)
  const drag = useRef<{ pointer: number; x: number; y: number; view: View } | null>(null)

  const { minX, minZ, width, depth } = bounds
  if (!plan.outlines.length || !Number.isFinite(width)) {
    return <p className="muted plan-empty">The scan has no floor outline for this storey.</p>
  }
  const pad = Math.max(width, depth) * 0.06
  const fullWidth = width + 2 * pad
  const fullDepth = depth + 2 * pad
  const viewWidth = fullWidth / view.zoom
  const viewDepth = fullDepth / view.zoom
  const viewBox = [
    minX - pad + view.x * fullWidth - viewWidth / 2,
    minZ - pad + view.y * fullDepth - viewDepth / 2,
    viewWidth,
    viewDepth,
  ].join(' ')
  const labelSize = Math.min(0.4, Math.max(0.22, Math.max(width, depth) / 32))

  // Keep the middle of the view over the plan, so it can't be dragged out of sight.
  const clamp = (v: View): View => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom))
    const half = 0.5 / zoom
    return { zoom, x: Math.min(1 - half, Math.max(half, v.x)), y: Math.min(1 - half, Math.max(half, v.y)) }
  }
  const zoomBy = (factor: number) => setView((v) => clamp({ ...v, zoom: v.zoom * factor }))

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (view.zoom === MIN_ZOOM) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, view }
  }
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start || start.pointer !== e.pointerId) return
    const box = e.currentTarget.getBoundingClientRect()
    // The plan keeps its proportions inside the box, so one screen pixel is the larger ratio.
    const metresPerPixel = Math.max(viewWidth / box.width, viewDepth / box.height)
    setView(
      clamp({
        ...start.view,
        x: start.view.x - ((e.clientX - start.x) * metresPerPixel) / fullWidth,
        y: start.view.y - ((e.clientY - start.y) * metresPerPixel) / fullDepth,
      }),
    )
  }
  const onPointerUp = () => (drag.current = null)

  return (
    <>
      <div className="plan-toolbar">
        {floors || <span />}
        <div className="plan-zoom">
          <button className="icon-button" aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_STEP)}>
            {icon(
              <>
                <path d="M12 5 V19" />
                <path d="M5 12 H19" />
              </>,
            )}
          </button>
          <button className="icon-button" aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(1 / ZOOM_STEP)}>
            {icon(<path d="M5 12 H19" />)}
          </button>
          <button className="icon-button" aria-label="Fit to screen" disabled={view === FIT} onClick={() => setView(FIT)}>
            {icon(
              <>
                <path d="M4 9 V4 H9" />
                <path d="M15 4 H20 V9" />
                <path d="M20 15 V20 H15" />
                <path d="M9 20 H4 V15" />
              </>,
            )}
          </button>
        </div>
      </div>
      <div className="plan-canvas">
        <svg
          className={`floor-plan${view.zoom > MIN_ZOOM ? ' pannable' : ''}`}
          viewBox={viewBox}
          role="img"
          aria-label={`Floor plan with ${plural(plan.rooms.length, 'room')}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {plan.outlines.map((outline, i) => (
            <polygon key={i} className="fp-floor" points={outline.map((p) => p.join(',')).join(' ')} />
          ))}
          {plan.walls.map((wall) => (
            <line
              key={wall.id}
              className={isExternal(wall.id) ? 'fp-wall external' : 'fp-wall'}
              x1={wall.a[0]}
              y1={wall.a[1]}
              x2={wall.b[0]}
              y2={wall.b[1]}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {plan.doors.map((door) => (
            <line key={door.id} className="fp-door" x1={door.a[0]} y1={door.a[1]} x2={door.b[0]} y2={door.b[1]} vectorEffect="non-scaling-stroke" />
          ))}
          {plan.windows.map((window) => (
            <line key={window.id} className="fp-window" x1={window.a[0]} y1={window.a[1]} x2={window.b[0]} y2={window.b[1]} vectorEffect="non-scaling-stroke" />
          ))}
          {plan.rooms.map((room, i) => (
            <text key={i} className="fp-label" x={room.centre[0]} y={room.centre[1]} fontSize={labelSize} textAnchor="middle" dominantBaseline="middle">
              {room.name}
            </text>
          ))}
        </svg>
      </div>
    </>
  )
}
