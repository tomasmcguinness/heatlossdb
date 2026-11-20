import type { HomeInsulation } from '../../fabric/home'
import { roomFigures } from '../../fabric/heatLoss'
import { CheckIcon, ItemIcons, PencilIcon } from './icons'
import { kindsOf, totalsOf, type EditorFloor, type RoomActions } from './model'
import { MARGIN, usePanZoom, useSize } from './panZoom'
import { ZoomControls } from './ZoomControls'

/**
 * A side view of the home: the roof, then each floor (top first) with its rooms side by side.
 * It starts fitted to the canvas (never larger than its natural size) and zooms like the plans.
 * With `insulation`, it shows the loft insulation under the roof, the outside walls' cavity
 * (insulated or empty) and the ground floor's insulation.
 */
export function OverviewCanvas({
  floors,
  actions,
  insulation,
  readOnly = false,
}: {
  floors: EditorFloor[]
  actions: RoomActions
  insulation?: HomeInsulation
  /** For a shared home: rooms can be picked but not renamed, and the owner's checks aren't shown. */
  readOnly?: boolean
}) {
  const walls = insulation?.walls ? ` cavity-${insulation.walls}` : ''
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
            {insulation?.loft && <div className={`overview-insulation loft ${insulation.loft}`} title="Loft insulation" aria-hidden="true" />}
            {[...floors].reverse().map((floor) => {
              const rooms = floor.rooms
              return (
                <div key={floor.plan.story} className={`overview-floor${walls}`}>
                  <div className="overview-floor-head">
                    <span className="overview-floor-name">{floor.name}</span>
                    <span className="muted small">{totalsOf(rooms)}</span>
                  </div>
                  <div className="overview-rooms">
                    {rooms.length ? (
                      rooms.map((room) => {
                        const state = room.id === actions.selectedId ? ' selected' : room.id === actions.hoveredId ? ' hovered' : ''
                        const figures = roomFigures(room)
                        return (
                          <div
                            key={room.id}
                            className={`overview-room${state}`}
                            onMouseEnter={() => actions.hover(room.id)}
                            onMouseLeave={() => actions.hover(null)}
                          >
                            <button
                              className="overview-room-main"
                              aria-label={room.name + (figures ? `, ${figures}` : '') + (room.checked && !readOnly ? ', checked' : '')}
                              aria-pressed={room.id === actions.selectedId}
                              onClick={unlessDragged(() => actions.select(room.id))}
                              onDoubleClick={readOnly ? undefined : () => actions.rename(room.id)}
                            >
                              <span className="room-name">{room.name}</span>
                              {figures && <span className="room-figures">{figures}</span>}
                              <ItemIcons kinds={kindsOf(room)} />
                              {room.checked && !readOnly && (
                                <span className="room-checked">
                                  <CheckIcon />
                                  Checked
                                </span>
                              )}
                            </button>
                            {!readOnly && (
                              <button className="room-pencil" aria-label={`Rename ${room.name}`} onClick={unlessDragged(() => actions.rename(room.id))}>
                                <PencilIcon />
                              </button>
                            )}
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
            {insulation?.floor && <div className="overview-insulation floor" title="Floor insulation" aria-hidden="true" />}
            <div className="overview-ground" aria-hidden="true" />
          </div>
        </div>
      </div>
      <ZoomControls view={view} onChange={setView} />
    </>
  )
}
