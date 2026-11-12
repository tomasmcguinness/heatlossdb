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

  const line = (key: string, className: string, a: [number, number], b: [number, number]) => (
    <line key={key} className={className} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" />
  )

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
              {plan.outlines.map((outline, i) => (
                <polygon key={i} className="fp-floor" points={outline.map((p) => p.join(',')).join(' ')} />
              ))}
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
              {plan.walls.map((wall) => line(wall.id, isExternal(wall.id) ? 'fp-wall external' : 'fp-wall', wall.a, wall.b))}
              {plan.doors.map((door) => line(door.id, 'fp-door', door.a, door.b))}
              {plan.windows.map((window) => line(window.id, 'fp-window', window.a, window.b))}
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
