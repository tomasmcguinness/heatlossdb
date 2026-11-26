import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatHeatLoss } from '../fabric/heatLoss'
import { homeInsulation, wallCavity } from '../fabric/home'
import { effectiveRole } from '../fabric/store'
import { classify } from '../scan/classify'
import { indexScan } from '../scan/parse'
import {
  heatLossFacts,
  heatPumpFacts,
  homeFacts,
  loadSharedHome,
  placementOf,
  reportedTotals,
  roomFacts,
  sharedFloors,
  type RoomFact,
  type SharedHome,
} from '../share/sharedHome'
import type { OutsideStretch, PlanWall } from '../scan/plan'
import { Brand } from './Brand'
import { FloorCanvas } from './editor/FloorCanvas'
import { BackIcon, DoorIcon, SkylightIcon, WindowIcon } from './editor/icons'
import { boundsOf, squareMetres, type EditorFloor, type RoomActions } from './editor/model'
import { OverviewCanvas } from './editor/OverviewCanvas'

type View = 'overview' | number

/** A home someone has shared by link, to look at only: its floor plan filling the screen, with the
 *  home's details, heat loss and heat pump beside it, and each room's details when picked. */
export function SharedHomePage({ shareId }: { shareId: string }) {
  const [home, setHome] = useState<SharedHome | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSharedHome(shareId)
      .then(setHome)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [shareId])

  if (error || !home) {
    return (
      <div className="app">
        <header className="topbar">
          <Brand />
        </header>
        <div className="dropzone">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <a className="button" href="/">
                Go to HeatLossDB
              </a>
            </>
          ) : (
            <p className="muted">Opening shared home…</p>
          )}
        </div>
      </div>
    )
  }
  return <SharedHomeView home={home} />
}

/** The home to look at only. Also used by the Admin portal, which puts its own note (and a way
 *  back) in the header's status instead of when the home was shared. */
export function SharedHomeView({ home: shared, status }: { home: SharedHome; status?: ReactNode }) {
  const { scan, edits } = shared
  const floors = useMemo(() => sharedFloors(scan, edits), [scan, edits])
  const isExternal = useMemo(() => {
    const roles = { elements: edits.elements ?? {}, autoRoles: classify(scan), byId: indexScan(scan).byId }
    return (id: string) => effectiveRole(roles, id) !== 'internal'
  }, [scan, edits])
  const home = useMemo(() => edits.home ?? {}, [edits])
  // Outside walls are drawn as cavity walls where the home or room has one, as in the editor.
  const cavityOf = useMemo(
    () => (wall: PlanWall, stretch: OutsideStretch) => {
      const chosen = edits.elements?.[wall.id]?.role
      return chosen === 'internal' || chosen === 'party' ? null : wallCavity(home, edits.rooms?.[stretch.room])
    },
    [edits, home],
  )
  const [picked, setView] = useState<View | null>(null)
  const ground = floors[0]?.plan.story
  const view: View = picked ?? ground ?? 'overview'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const floor = view === 'overview' ? null : (floors.find((f) => f.plan.story === view) ?? null)
  const rooms = floors.flatMap((f) => f.rooms)
  const room = rooms.find((r) => r.id === selectedId) ?? null
  const bounds = boundsOf(floors)
  const actions: RoomActions = {
    hoveredId,
    selectedId,
    hover: setHoveredId,
    select: (id) => setSelectedId((current) => (current === id ? null : id)),
    rename: () => {},
  }
  const sharedOn = new Date(shared.sharedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="editor shared-home">
      <header className="editor-head">
        <div className="editor-title">
          <Brand />
          <span className="editor-divider" aria-hidden="true" />
          <h1 className="editor-file shared-home-name">{shared.name}</h1>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Views">
          {(['overview', ...floors.map((f) => f.plan.story)] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {v === 'overview' ? 'Overview' : floors.find((f) => f.plan.story === v)?.name}
            </button>
          ))}
        </div>

        <div className="editor-status">
          {status ?? <span className="muted small">Shared {sharedOn}</span>}
        </div>
      </header>

      <div className="editor-body">
        <aside className="editor-panel" aria-label={room ? room.name : 'This home'}>
          {room ? (
            <>
              <button className="link back-link" onClick={() => setSelectedId(null)}>
                <BackIcon />
                This home
              </button>
              <div className="panel-intro">
                <h2>{room.name}</h2>
                <p className="muted">{floors.find((f) => f.plan.story === room.story)?.name}</p>
              </div>
              <Facts facts={roomFacts(room, home, edits.rooms?.[room.id], placementOf(floors, room))} />
            </>
          ) : (
            <HomeSummary shared={shared} floors={floors} floor={floor} actions={actions} />
          )}
        </aside>

        <section className="editor-canvas" aria-label={floor ? `${floor.name} plan` : 'Side view'}>
          {floor && Number.isFinite(bounds.width) ? (
            <FloorCanvas floor={floor} bounds={bounds} actions={actions} isExternal={isExternal} cavityOf={cavityOf} readOnly />
          ) : floor ? (
            <p className="muted canvas-empty">The scan has no floor outline for this storey.</p>
          ) : (
            <OverviewCanvas floors={floors} actions={actions} insulation={homeInsulation(home)} readOnly />
          )}
          <p className="canvas-hint">Click a room to see its details. Scroll to zoom, drag to move.</p>
          <div className="canvas-legend" aria-hidden="true">
            <span>
              <WindowIcon size={16} />
              Window
            </span>
            <span>
              <DoorIcon size={16} />
              External door
            </span>
            <span>
              <SkylightIcon size={16} />
              Skylight
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

function Facts({ facts }: { facts: RoomFact[] }) {
  return (
    <dl className="fabric-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>
            {fact.value}
            {fact.own && <span className="tag tag-set">This room</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The home at a glance, its heat loss and heat pump, then its rooms. */
function HomeSummary({
  shared,
  floors,
  floor,
  actions,
}: {
  shared: SharedHome
  floors: EditorFloor[]
  floor: EditorFloor | null
  actions: RoomActions
}) {
  const all = floors.flatMap((f) => f.rooms)
  const totals = reportedTotals(all)
  const area = all.reduce((total, r) => total + (r.area ?? 0), 0)
  const shown = (floor ? [floor] : floors).flatMap((f) => f.rooms.map((room) => ({ room, floorName: f.name })))
  const heatLoss = heatLossFacts(shared.heatPump, all, area)
  const heatPump = heatPumpFacts(shared.heatPump)
  const sample = shared.heatPump?.source === 'sample'

  return (
    <>
      <section className="shared-section" aria-labelledby="home-title">
        <h2 id="home-title">About this home</h2>
        <Facts facts={homeFacts(shared.edits.home ?? {}, shared.postcodeDistrict, floors)} />
      </section>

      <section className="shared-section" aria-labelledby="heat-loss-title">
        <h3 id="heat-loss-title">Heat loss</h3>
        {heatLoss.length ? <Facts facts={heatLoss} /> : <p className="muted small">No heat loss figures were shared.</p>}
        {totals.withFigures > 0 && totals.withFigures < totals.heated && (
          <p className="small muted">
            {totals.withFigures} of {totals.heated} heated rooms have a heat loss figure; the rooms’ total is for those only.
          </p>
        )}
      </section>

      <section className="shared-section" aria-labelledby="heat-pump-title">
        <h3 id="heat-pump-title">Heat pump</h3>
        {heatPump.length ? <Facts facts={heatPump} /> : <p className="muted small">No heat pump details were shared.</p>}
        {sample && <p className="small muted">These are sample figures, made up for testing.</p>}
      </section>

      <section className="panel-rooms" aria-labelledby="rooms-title">
        <h3 id="rooms-title">{floor ? `${floor.name} rooms` : 'All rooms'}</h3>
        {shown.length ? (
          <ul className="panel-room-list">
            {shown.map(({ room: r, floorName }) => (
              <li
                key={r.id}
                className={r.id === actions.hoveredId ? 'hovered' : ''}
                onMouseEnter={() => actions.hover(r.id)}
                onMouseLeave={() => actions.hover(null)}
              >
                <button className="panel-room" onClick={() => actions.select(r.id)}>
                  <span className="panel-room-name">
                    <span>{r.name}</span>
                    {!floor && <span className="small muted">{floorName}</span>}
                  </span>
                  <span className="panel-room-status">
                    <span className="muted small">
                      {!r.heated ? 'Not heated' : r.heatLossW !== undefined ? formatHeatLoss(r.heatLossW) : r.area !== null ? squareMetres(r.area) : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No rooms on this floor.</p>
        )}
      </section>
    </>
  )
}
