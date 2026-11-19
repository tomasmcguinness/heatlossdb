import { useId, useMemo } from 'react'
import type { WallCavity } from '../../fabric/home'
import { roomFigures } from '../../fabric/heatLoss'
import type { Point2 } from '../../scan/outline'
import type { OutsideStretch, PlanWall } from '../../scan/plan'
import { CheckIcon, ItemIcons } from './icons'
import { kindsOf, type EditorFloor, type RoomActions } from './model'
import { MARGIN, usePanZoom } from './panZoom'
import {
  cavityWallShapes,
  cornersOf,
  EXTERNAL_WALL,
  gapOffset,
  INTERNAL_WALL,
  outwardOf,
  pieceShape,
  splitPiece,
  type CavityLine,
  type Corner,
} from './wallShapes'
import { ZoomControls } from './ZoomControls'

export interface Bounds {
  minX: number
  minZ: number
  width: number
  depth: number
}

type CavityOf = (wall: PlanWall, stretch: OutsideStretch) => WallCavity | null

/** The stretches of the plan's walls drawn as cavity wall: each with its cavity, outward direction
 *  and the corners at its ends, grouped by wall. */
function cavityStretches(walls: PlanWall[], cavityOf: CavityOf | undefined) {
  if (!cavityOf) return new Map<string, CavityStretch[]>()
  const found = walls.flatMap((wall) =>
    wall.outside.flatMap((stretch) => {
      const cavity = cavityOf(wall, stretch)
      if (!cavity) return []
      const at = (t: number): Point2 => [wall.a[0] + t * (wall.b[0] - wall.a[0]), wall.a[1] + t * (wall.b[1] - wall.a[1])]
      const line: CavityLine = { a: at(stretch.t0), b: at(stretch.t1), inside: stretch.inside }
      return [{ wall, t0: stretch.t0, t1: stretch.t1, cavity, line }]
    }),
  )
  const corners = cornersOf(found.map((f) => f.line))
  const byWall = new Map<string, CavityStretch[]>()
  found.forEach((f, i) => {
    const list = byWall.get(f.wall.id) ?? []
    list.push({ t0: f.t0, t1: f.t1, cavity: f.cavity, line: f.line, corners: corners[i], out: outwardOf(f.line) })
    byWall.set(f.wall.id, list)
  })
  return byWall
}

interface CavityStretch {
  t0: number
  t1: number
  cavity: WallCavity
  line: CavityLine
  corners: [Corner, Corner]
  out: Point2
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
  cavityOf,
}: {
  floor: EditorFloor
  bounds: Bounds
  actions: RoomActions
  isExternal: (id: string) => boolean
  /** Whether a stretch of outside wall is a cavity wall, filled or empty, to draw it as one.
   *  Without it, every wall is drawn plain. */
  cavityOf?: CavityOf
}) {
  const { viewport, size, view, setView, pointerHandlers, unlessDragged } = usePanZoom()
  const { zoom } = view
  const hatch = `${useId().replace(/:/g, '')}-insulation`

  const { plan, rooms } = floor
  const cavities = useMemo(() => cavityStretches(plan.walls, cavityOf), [plan.walls, cavityOf])
  const cavityLines = [...cavities.values()].flat().map((c) => c.line)
  // Each wall's pieces, split where its cavity stretches start and end.
  const parts = plan.walls.flatMap((wall) =>
    wall.pieces.flatMap((piece, k) =>
      splitPiece(piece, wall, cavities.get(wall.id) ?? []).map((part, j) => ({ key: `${wall.id}-${k}-${j}`, wall, ...part })),
    ),
  )
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
              {/* Cavity walls are drawn their real thickness, outward from the room's inside face:
                  both leaves in the wall's colour, then the cavity over them, hatched where it's
                  insulated and left as a gap where it's empty. */}
              <defs>
                <pattern id={hatch} patternUnits="userSpaceOnUse" width={0.05} height={0.05} patternTransform="rotate(45)">
                  <rect className="fp-insulation-ground" width={0.05} height={0.05} />
                  <line className="fp-insulation-hatch" x1={0.025} y1={0} x2={0.025} y2={0.05} />
                </pattern>
              </defs>
              <g className="fp-walls">
                {parts.map(({ key, wall, piece, stretch }) => (
                  <path
                    key={key}
                    d={
                      stretch
                        ? cavityWallShapes(piece, stretch.out, stretch.corners).wall
                        : pieceShape(piece, isExternal(wall.id) ? EXTERNAL_WALL : INTERNAL_WALL)
                    }
                  />
                ))}
              </g>
              <g className="fp-cavities">
                {parts.flatMap(({ key, piece, stretch }) =>
                  stretch
                    ? [
                        <path
                          key={key}
                          className={stretch.cavity === 'filled' ? 'fp-cavity filled' : 'fp-cavity empty'}
                          fill={stretch.cavity === 'filled' ? `url(#${hatch})` : undefined}
                          d={cavityWallShapes(piece, stretch.out, stretch.corners).cavity}
                        />,
                      ]
                    : [],
                )}
              </g>
              {/* Doors and windows as a thin line across their gap, the same width at any zoom, and
                  across the middle of a cavity wall. Openings are left as a plain gap. */}
              <g className="fp-gaps">
                {[...plan.doors, ...plan.windows].map(({ id, a, b }) => {
                  const [ox, oz] = gapOffset({ a, b }, cavityLines)
                  return <line key={id} x1={a[0] + ox} y1={a[1] + oz} x2={b[0] + ox} y2={b[1] + oz} vectorEffect="non-scaling-stroke" />
                })}
              </g>
            </svg>
            {rooms.map((room) => {
              const state = room.id === actions.selectedId ? ' selected' : room.id === actions.hoveredId ? ' hovered' : ''
              const figures = roomFigures(room)
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
                    aria-label={room.name + (figures ? `, ${figures}` : '') + (room.checked ? ', checked' : '')}
                    aria-pressed={room.id === actions.selectedId}
                    onClick={unlessDragged(() => actions.select(room.id))}
                    onDoubleClick={() => actions.rename(room.id)}
                  >
                    <span className="room-name">{room.name}</span>
                    {figures && <span className="room-figures">{figures}</span>}
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
