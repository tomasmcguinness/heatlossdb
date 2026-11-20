import { useCallback, useState } from 'react'
import { Brand } from '../Brand'
import { homeInsulation, isHomeFabricSet, wallCavity } from '../../fabric/home'
import { effectiveRole, useFabric } from '../../fabric/store'
import type { OutsideStretch, PlanWall } from '../../scan/plan'
import { HomeFabricDialog } from '../fabric/HomeFabricDialog'
import { ShareDialog } from '../share/ShareDialog'
import { FloorCanvas } from './FloorCanvas'
import { FloorPlanDialog } from './FloorPlanDialog'
import { DoorIcon, HomeIcon, SkylightIcon, WindowIcon } from './icons'
import { boundsOf, useEditorFloors, type RoomActions } from './model'
import { OverviewCanvas } from './OverviewCanvas'
import { RoomPanel } from './RoomPanel'
import { ScanActions } from './ScanActions'
import { AccountButton } from '../AccountButton'

type View = 'overview' | number

/** View my scan: every room to check and correct, as a side view of the home or floor by floor. */
export function ScanEditor({ onSearch, onExplore }: { onSearch: () => void; onExplore: () => void }) {
  const scanName = useFabric((s) => s.scanName)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const floors = useEditorFloors()
  // Opens on the ground floor (the lowest storey). Null until the user picks a view, so it follows
  // the floors when they change, such as on switching to another version of the floor plan.
  const [picked, setView] = useState<View | null>(null)
  const ground = floors[0]?.plan.story
  const view: View = picked !== null && (picked === 'overview' || floors.some((f) => f.plan.story === picked)) ? picked : (ground ?? 'overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const home = useFabric((s) => s.home)
  const [fabricOpen, setFabricOpen] = useState(false)
  const [floorplanOpen, setFloorplanOpen] = useState(false)

  const floor =view === 'overview' ? null : (floors.find((f) => f.plan.story === view) ?? null)
  const rooms = floors.flatMap((f) => f.rooms)
  const room = rooms.find((r) => r.id === selectedId) ?? null

  // Each stretch of wall with a room on one side only is drawn as a cavity wall when that room has
  // one, by its own answer or the home's. A scanned wall can be outside for part of its length, so
  // this goes by the stretch, not the automatic guess at the whole wall's role; only a role the user
  // chose (internal, or a party wall) overrides it.
  const roomSettings = useFabric((s) => s.rooms)
  const cavityOf = useCallback(
    (wall: PlanWall, stretch: OutsideStretch) => {
      const chosen = elements[wall.id]?.role
      return chosen === 'internal' || chosen === 'party' ? null : wallCavity(home, roomSettings[stretch.room])
    },
    [elements, home, roomSettings],
  )
  // The side view shows the whole home's insulation, from Home fabric.
  const insulation = homeInsulation(home)
  const shownCavities = new Set(
    floor ? floor.plan.walls.flatMap((w) => w.outside.map((s) => cavityOf(w, s))).filter(Boolean) : [insulation.walls].filter(Boolean),
  )

  const actions: RoomActions = {
    hoveredId,
    selectedId,
    hover: setHoveredId,
    // Clicking the selected room again deselects it.
    select: (id) => {
      setSelectedId((current) => (current === id ? null : id))
      setRenaming(false)
    },
    rename: (id) => {
      setSelectedId(id)
      setRenaming(true)
    },
  }
  const clear = () => {
    setSelectedId(null)
    setRenaming(false)
  }

  // Every floor is drawn within the bounds of them all, so they share a scale.
  const bounds = boundsOf(floors)

  return (
    <div className="editor">
      <header className="editor-head">
        <div className="editor-title">
          <Brand />
          <span className="editor-divider" aria-hidden="true" />
          <span className="muted editor-file">{scanName ?? 'Your scan'}</span>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Views">
          {(['overview', ...floors.map((f) => f.plan.story)] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'on' : ''}
              // The selection carries over, so the room stays highlighted wherever it's shown.
              onClick={() => setView(v)}
            >
              {v === 'overview' ? 'Overview' : floors.find((f) => f.plan.story === v)?.name}
              {room && room.story === v && (
                <span className="tab-marker" title={`${room.name} is on this floor`}>
                  <span className="visually-hidden">, has {room.name}</span>
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="editor-status">
          <span className="muted">
            {rooms.filter((r) => r.checked).length} of {rooms.length} rooms checked
          </span>
          <button
            className={isHomeFabricSet(home) ? 'button subtle fabric-button' : 'button subtle fabric-button to-do'}
            onClick={() => setFabricOpen(true)}
          >
            <HomeIcon />
            Home fabric
          </button>
          <ScanActions onShare={() => setSharing(true)} onSearch={onSearch} onExplore={onExplore} onFloorplan={() => setFloorplanOpen(true)} />
          <AccountButton />
        </div>
      </header>

      <div className="editor-body">
        <section className="editor-canvas" aria-label={floor ? `${floor.name} plan` : 'Side view'}>
          {floor && Number.isFinite(bounds.width) ? (
            <FloorCanvas
              floor={floor}
              bounds={bounds}
              actions={actions}
              isExternal={(id) => effectiveRole({ elements, autoRoles, byId }, id) !== 'internal'}
              cavityOf={cavityOf}
            />
          ) : floor ? (
            <p className="muted canvas-empty">The scan has no floor outline for this storey.</p>
          ) : (
            <OverviewCanvas floors={floors} actions={actions} insulation={insulation} />
          )}

          <p className="canvas-hint">
            {floor
              ? 'Hover to highlight a room. Click to select it, double-click to rename. Scroll to zoom, drag to move.'
              : 'Side view of every floor. Hover to highlight a room, click to select, double-click or pencil to rename. Scroll to zoom, drag to move.'}
          </p>
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
            {shownCavities.has('filled') && (
              <span>
                <span className="legend-cavity filled" />
                Cavity insulation
              </span>
            )}
            {shownCavities.has('empty') && (
              <span>
                <span className="legend-cavity empty" />
                Empty cavity
              </span>
            )}
            {!floor && insulation.loft && (
              <span>
                <span className="legend-insulation" />
                Loft insulation
              </span>
            )}
            {!floor && insulation.floor && (
              <span>
                <span className="legend-insulation" />
                Floor insulation
              </span>
            )}
          </div>
        </section>

        <RoomPanel
          floors={floors}
          floor={floor}
          room={room}
          renaming={renaming}
          actions={actions}
          onRenaming={setRenaming}
          onClear={clear}
          onFabric={() => setFabricOpen(true)}
        />
      </div>

      {fabricOpen && <HomeFabricDialog onClose={() => setFabricOpen(false)} />}

      {floorplanOpen && (
        <FloorPlanDialog
          onClose={() => setFloorplanOpen(false)}
          // Another plan can have other storeys, so start again from its ground floor.
          onSwitched={() => {
            setView(null)
            clear()
          }}
        />
      )}

      {sharing && (
        <ShareDialog
          rooms={rooms}
          onClose={() => setSharing(false)}
          onFabric={() => {
            setSharing(false)
            setFabricOpen(true)
          }}
          onCheckRooms={() => {
            setSharing(false)
            const next = rooms.find((r) => !r.checked)
            if (!next) return
            setView(next.story)
            setSelectedId(next.id)
            setRenaming(false)
          }}
        />
      )}
    </div>
  )
}
