import { useState } from 'react'
import { isHomeFabricSet } from '../../fabric/home'
import { effectiveRole, useFabric } from '../../fabric/store'
import { HomeFabricDialog } from '../fabric/HomeFabricDialog'
import { ShareDialog } from '../share/ShareDialog'
import { FloorCanvas, type Bounds } from './FloorCanvas'
import { BackIcon, DoorIcon, HomeIcon, SkylightIcon, WindowIcon } from './icons'
import { useEditorFloors, type RoomActions } from './model'
import { OverviewCanvas } from './OverviewCanvas'
import { RoomPanel } from './RoomPanel'
import { ScanActions } from './ScanActions'
import { AccountButton } from '../AccountButton'

type View = 'overview' | number

/** View my scan: every room to check and correct, as a side view of the home or floor by floor. */
export function ScanEditor({
  onBack,
  onSearch,
  startSharing = false,
}: {
  onBack: () => void
  onSearch: () => void
  startSharing?: boolean
}) {
  const scanName = useFabric((s) => s.scanName)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const floors = useEditorFloors()
  const [view, setView] = useState<View>('overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // "Share your home" on What next opens the editor with Share already open.
  const [sharing, setSharing] = useState(startSharing)
  const home = useFabric((s) => s.home)
  const [fabricOpen, setFabricOpen] = useState(false)

  const floor = view === 'overview' ? null : (floors.find((f) => f.plan.story === view) ?? null)
  const rooms = floors.flatMap((f) => f.rooms)
  const room = rooms.find((r) => r.id === selectedId) ?? null

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
  const points = floors.flatMap((f) => f.plan.outlines.flat())
  const minX = Math.min(...points.map((p) => p[0]))
  const minZ = Math.min(...points.map((p) => p[1]))
  const bounds: Bounds = {
    minX,
    minZ,
    width: Math.max(...points.map((p) => p[0])) - minX,
    depth: Math.max(...points.map((p) => p[1])) - minZ,
  }

  return (
    <div className="editor">
      <header className="editor-head">
        <div className="editor-title">
          <button className="icon-only back-button" aria-label="Back to options" title="Back to options" onClick={onBack}>
            <BackIcon />
          </button>
          <span className="brand" aria-label="HeatLossDB">
            <img src="/logo.svg" alt="" width={26} height={26} />
            <span aria-hidden="true">
              heatloss<span className="brand-db">db</span>
            </span>
          </span>
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
          <ScanActions onShare={() => setSharing(true)} onSearch={onSearch} />
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
            />
          ) : floor ? (
            <p className="muted canvas-empty">The scan has no floor outline for this storey.</p>
          ) : (
            <OverviewCanvas floors={floors} actions={actions} />
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
