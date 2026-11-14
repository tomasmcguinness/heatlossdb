import type { Point2 } from '../../scan/outline'
import type { WallPiece } from '../../scan/plan'
import { CheckIcon, ItemIcons } from './icons'
import { kindsOf, type EditorFloor, type RoomActions } from './model'
import { MARGIN, usePanZoom } from './panZoom'
import { ZoomControls } from './ZoomControls'

export interface Bounds {
  minX: number
  minZ: number
  width: number
  depth: number
}

/** Wall thicknesses (m) the plan draws. RoomPlan reports walls as flat planes, so these are nominal. */
const INTERNAL_WALL = 0.06
const EXTERNAL_WALL = 0.12

/** A piece of wall as a rectangle `thickness` wide, carried on by half that at the wall's own ends. */
function pieceShape({ a, b, end }: WallPiece, thickness: number): string {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (!length) return ''
  const half = thickness / 2
  const [dx, dz] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
  const [nx, nz] = [-dz * half, dx * half]
  const start: Point2 = end[0] ? [a[0] - dx * half, a[1] - dz * half] : a
  const finish: Point2 = end[1] ? [b[0] + dx * half, b[1] + dz * half] : b
  const corners: Point2[] = [
    [start[0] + nx, start[1] + nz],
    [finish[0] + nx, finish[1] + nz],
    [finish[0] - nx, finish[1] - nz],
    [start[0] - nx, start[1] - nz],
  ]
  return `M${corners.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join('L')}Z`
}

/**
 * One floor's plan. Every floor is drawn within the bounds of them all, so they share a scale and
 * each sits where it is over the one below; zoom and position carry over between floors.
 */
export function FloorCanvas({
  floor,
  bounds,
  actions,
  isExternal,
}: {
  floor: EditorFloor
  bounds: Bounds
  actions: RoomActions
  isExternal: (id: string) => boolean
}) {
  const { viewport, size, view, setView, pointerHandlers, unlessDragged } = usePanZoom()
  const { zoom } = view

  const { plan, rooms } = floor
  const pad = Math.max(bounds.width, bounds.depth) * 0.02
  const fullWidth = bounds.width + 2 * pad
  const fullDepth = bounds.depth + 2 * pad
  const fit = Math.max(0, Math.min((size.width - 2 * MARGIN) / fullWidth, (size.height - 2 * MARGIN) / fullDepth))
  const scale = fit * zoom
  const toX = (x: number) => (x - bounds.minX + pad) * scale
  const toY = (z: number) => (z - bounds.minZ + pad) * scale

  return (
    <>
      <div
        ref={viewport}
        className="zoom-canvas"
        {...pointerHandlers(fullWidth * scale, fullDepth * scale)}
      >
        {scale > 0 && (
          <div
            className="floor-stage"
            style={{
              width: fullWidth * scale,
              height: fullDepth * scale,
              transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
            }}
          >
            <svg
              viewBox={`${bounds.minX - pad} ${bounds.minZ - pad} ${fullWidth} ${fullDepth}`}
              role="img"
              aria-label={`${floor.name} plan`}
            >
              {rooms.map((room) => (
                <path
                  key={room.id}
                  d={room.shape}
                  shapeRendering="crispEdges"
                  className={`fp-room${room.id === actions.selectedId ? ' selected' : room.id === actions.hoveredId ? ' hovered' : ''}`}
                  onMouseEnter={() => actions.hover(room.id)}
                  onMouseLeave={() => actions.hover(null)}
                  onClick={unlessDragged(() => actions.select(room.id))}
                  onDoubleClick={() => actions.rename(room.id)}
                />
              ))}
              {/* Each wall runs along its own X axis from -width/2 to +width/2, placed by its transform
                  (see wallPointAt), and is drawn at its real thickness with its doors, windows and
                  openings cut out. Its own ends carry on by half the thickness, so walls meeting at a
                  corner overlap and close it; the sides of a gap stop square. */}
              <g className="fp-walls">
                {plan.walls.flatMap(({ id, pieces }) =>
                  pieces.map((piece, k) => (
                    <path key={`${id}-${k}`} d={pieceShape(piece, isExternal(id) ? EXTERNAL_WALL : INTERNAL_WALL)} />
                  )),
                )}
              </g>
              {/* Doors and windows as a thin line across their gap, the same width at any zoom.
                  Openings are left as a plain gap. */}
              <g className="fp-gaps">
                {[...plan.doors, ...plan.windows].map(({ id, a, b }) => (
                  <line key={id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            </svg>
            {rooms.map((room) => {
              const state = room.id === actions.selectedId ? ' selected' : room.id === actions.hoveredId ? ' hovered' : ''
              return (
                <div
                  key={room.id}
                  className={`floor-label${state}`}
                  style={{ left: toX(room.centre[0]), top: toY(room.centre[1]) }}
                  onMouseEnter={() => actions.hover(room.id)}
                  onMouseLeave={() => actions.hover(null)}
                >
                  <button
                    className="floor-label-main"
                    aria-label={room.name + (room.checked ? ', checked' : '')}
                    aria-pressed={room.id === actions.selectedId}
                    onClick={unlessDragged(() => actions.select(room.id))}
                    onDoubleClick={() => actions.rename(room.id)}
                  >
                    <span className="room-name">{room.name}</span>
                    <ItemIcons kinds={kindsOf(room)} />
                    {room.checked && (
                      <span className="room-checked">
                        <CheckIcon />
                        Checked
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ZoomControls view={view} onChange={setView} />
    </>
  )
}
