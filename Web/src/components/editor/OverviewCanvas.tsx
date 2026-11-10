import { CheckIcon, ItemIcons, PencilIcon } from './icons'
import { kindsOf, totalsOf, type EditorFloor, type RoomActions } from './model'
import { MARGIN, usePanZoom, useSize } from './panZoom'
import { ZoomControls } from './ZoomControls'

/**
 * A side view of the home: the roof, then each floor (top first) with its rooms side by side.
 * It starts fitted to the canvas (never larger than its natural size) and zooms like the plans.
 */
export function OverviewCanvas({ floors, actions }: { floors: EditorFloor[]; actions: RoomActions }) {
  const { viewport, size, view, setView, pointerHandlers, unlessDragged } = usePanZoom()
  const [content, natural] = useSize<HTMLDivElement>()
  const fit = natural.width
    ? Math.min(1, (size.width - 2 * MARGIN) / natural.width, (size.height - 2 * MARGIN) / natural.height)
    : 1
  const scale = Math.max(0, fit) * view.zoom

  return (
    <>
      <div ref={viewport} className="zoom-canvas" {...pointerHandlers(natural.width * scale, natural.height * scale)}>
        <div
          className="overview-stage"
          style={{ transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${scale})` }}
        >
          <div ref={content} className="overview" role="group" aria-label="Side view of all floors">
            <div className="overview-roof" aria-hidden="true">
              <span>Roof</span>
            </div>
            {[...floors].reverse().map((floor) => {
              const rooms = floor.rooms.filter((room) => !room.removed)
              return (
                <div key={floor.plan.story} className="overview-floor">
                  <div className="overview-floor-head">
                    <span className="overview-floor-name">{floor.name}</span>
                    <span className="muted small">{totalsOf(rooms)}</span>
                  </div>
                  <div className="overview-rooms">
                    {rooms.length ? (
                      rooms.map((room) => {
                        const state = room.id === actions.selectedId ? ' selected' : room.id === actions.hoveredId ? ' hovered' : ''
                        return (
                          <div
                            key={room.id}
                            className={`overview-room${state}`}
                            onMouseEnter={() => actions.hover(room.id)}
                            onMouseLeave={() => actions.hover(null)}
                          >
                            <button
                              className="overview-room-main"
                              aria-label={room.name + (room.checked ? ', checked' : '')}
                              aria-pressed={room.id === actions.selectedId}
                              onClick={unlessDragged(() => actions.select(room.id))}
                              onDoubleClick={() => actions.edit(room.id)}
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
                            <button className="room-pencil" aria-label={`Edit ${room.name}`} onClick={unlessDragged(() => actions.edit(room.id))}>
                              <PencilIcon />
                            </button>
                          </div>
                        )
                      })
                    ) : (
                      <p className="muted small">No rooms were named on this floor.</p>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="overview-ground" aria-hidden="true" />
          </div>
        </div>
      </div>
      <ZoomControls view={view} onChange={setView} />
    </>
  )
}
