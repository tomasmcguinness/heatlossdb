import { useState } from 'react'
import { effectiveRole, useFabric } from '../../fabric/store'
import { FloorCanvas, type Bounds } from './FloorCanvas'
import { BackIcon, DoorIcon, HomeIcon, SkylightIcon, WindowIcon } from './icons'
import { useEditorFloors, type RoomActions } from './model'
import { OverviewCanvas } from './OverviewCanvas'
import { RoomPanel } from './RoomPanel'

type View = 'overview' | number

/** View my scan: every room to check and correct, as a side view of the home or floor by floor. */
export function ScanEditor({ onBack }: { onBack: () => void }) {
  const scanName = useFabric((s) => s.scanName)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const floors = useEditorFloors()
  const [view, setView] = useState<View>('overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const floor = view === 'overview' ? null : (floors.find((f) => f.plan.story === view) ?? null)
  const rooms = floors.flatMap((f) => f.rooms)
  const room = rooms.find((r) => r.id === selectedId && !r.removed) ?? null
  const counted = rooms.filter((r) => !r.removed)

  const actions: RoomActions = {
    hoveredId,
    selectedId,
    hover: setHoveredId,
    // Clicking the selected room again deselects it.
    select: (id) => {
      setSelectedId((current) => (current === id ? null : id))
      setEditing(false)
    },
    edit: (id) => {
      setSelectedId(id)
      setEditing(true)
    },
  }
  const clear = () => {
    setSelectedId(null)
    setEditing(false)
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
            {counted.filter((r) => r.checked).length} of {counted.length} rooms checked
          </span>
          <button className="button subtle fabric-button" disabled title="Coming soon">
            <HomeIcon />
            Home fabric
          </button>
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
              ? 'Hover to highlight a room. Click to select it, double-click or use the pencil to edit. Scroll to zoom, drag to move.'
              : 'Side view of every floor. Hover to highlight a room, click to select, double-click or pencil to edit. Scroll to zoom, drag to move.'}
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
          editing={editing}
          actions={actions}
          onEditing={setEditing}
          onClear={clear}
        />
      </div>
    </div>
  )
}
