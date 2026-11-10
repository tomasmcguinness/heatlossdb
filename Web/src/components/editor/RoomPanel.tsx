import { useRef, useState } from 'react'
import { useFabric, type EditedRoom, type RoomElement } from '../../fabric/store'
import { BackIcon, BinIcon, InfoIcon, KindIcon, PencilIcon } from './icons'
import { kindName, type ItemKind } from './kinds'
import { squareMetres, type EditorFloor, type RoomActions } from './model'

interface RoomPanelProps {
  floors: EditorFloor[]
  /** The floor being shown, or null on the overview. */
  floor: EditorFloor | null
  room: EditedRoom | null
  /** Whether the selected room's name is being changed. */
  renaming: boolean
  actions: RoomActions
  onRenaming: (renaming: boolean) => void
  onClear: () => void
}

/** The side panel: every room to check, or the selected room ready to correct. */
export function RoomPanel(props: RoomPanelProps) {
  const { room } = props
  return (
    <aside className="editor-panel" aria-label="Rooms">
      {room ? <RoomDetails {...props} room={room} /> : <AllRooms {...props} />}
    </aside>
  )
}

function AllRooms({ floors, floor, actions }: RoomPanelProps) {
  const setRoom = useFabric((s) => s.setRoom)
  const shown = floor ? [floor] : floors
  const rooms = shown.flatMap((f) => f.rooms.map((room) => ({ room, floorName: f.name })))
  const active = rooms.filter(({ room }) => !room.removed)
  const removed = rooms.filter(({ room }) => room.removed)

  return (
    <>
      <div className="panel-intro">
        <h2>Your home</h2>
        <p className="muted">Check each room’s doors, windows and skylights. Walls, roof and floor are set once for the whole home.</p>
      </div>

      <p className="panel-note">
        <InfoIcon />
        <span>
          Parts of your scan may look incomplete. The phone’s LiDAR scanner can miss walls it can’t see clearly, such as
          behind furniture, inside cupboards, or around glass and mirrors, so some walls may be short, missing or slightly out
          of line.
        </span>
      </p>

      <section className="panel-card" aria-labelledby="fabric-title">
        <div className="panel-card-head">
          <h3 id="fabric-title">Home fabric</h3>
          <span className="badge badge-soon">Coming soon</span>
        </div>
        <dl className="fabric-facts">
          {['Loft / roof', 'External walls', 'Glazing', 'Ground floor'].map((label) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="muted">Not set</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel-rooms" aria-labelledby="rooms-title">
        <h3 id="rooms-title">{floor ? `${floor.name} rooms` : 'All rooms'}</h3>
        {active.length ? (
          <ul className="panel-room-list">
            {active.map(({ room: r, floorName }) => (
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
                  <span className={r.checked ? 'status-checked' : 'muted small'}>{r.checked ? 'Checked' : 'To check'}</span>
                </button>
                <button className="panel-room-edit" aria-label={`Rename ${r.name}`} onClick={() => actions.rename(r.id)}>
                  <PencilIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">The scan didn’t name any rooms here.</p>
        )}
      </section>

      {removed.length > 0 && (
        <section className="panel-rooms" aria-labelledby="removed-title">
          <h3 id="removed-title">Removed</h3>
          <ul className="panel-room-list">
            {removed.map(({ room: r, floorName }) => (
              <li key={r.id} className="removed">
                <span className="panel-room-name panel-room">
                  <span>{r.name}</span>
                  {!floor && <span className="small muted">{floorName}</span>}
                </span>
                <button className="link restore" onClick={() => setRoom(r.id, (s) => ({ ...s, removed: false }))}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** "External door 1", "Window 2"… numbered per kind in the order listed. */
function itemNames(items: RoomElement[]): string[] {
  const seen: Partial<Record<ItemKind, number>> = {}
  return items.map((item) => {
    seen[item.kind] = (seen[item.kind] ?? 0) + 1
    return `${kindName(item.kind)} ${seen[item.kind]}`
  })
}

/** The room's name, which turns into a text box when clicked. */
function RoomName({ room, renaming, onRenaming }: { room: EditedRoom; renaming: boolean; onRenaming: (renaming: boolean) => void }) {
  const setRoom = useFabric((s) => s.setRoom)
  const [draft, setDraft] = useState(room.name)
  // Escape removes the text box, which blurs it; that blur mustn't save.
  const cancelled = useRef(false)

  if (!renaming) {
    return (
      <h2>
        <button className="room-title" title="Rename this room" onClick={() => onRenaming(true)}>
          <span>{room.name}</span>
          <PencilIcon />
        </button>
      </h2>
    )
  }

  const save = () => {
    if (cancelled.current) return
    const name = draft.trim()
    // An empty name, or the scanned one, goes back to what the scan called it.
    setRoom(room.id, (s) => ({ ...s, name: name && name !== room.scannedName ? name : undefined }))
    onRenaming(false)
  }
  return (
    <input
      className="room-title-input"
      aria-label="Room name"
      autoFocus
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') {
          cancelled.current = true
          onRenaming(false)
        }
      }}
    />
  )
}

/** The selected room: its name, whether it's heated, and its doors, windows and skylights, all
 *  editable. */
function RoomDetails({ floors, room, renaming, onRenaming, onClear }: RoomPanelProps & { room: EditedRoom }) {
  const setRoom = useFabric((s) => s.setRoom)
  const update = (patch: Parameters<typeof setRoom>[1]) => setRoom(room.id, patch)
  const names = itemNames(room.items)
  const height = floors.find((f) => f.plan.story === room.story)?.plan.wallHeight
  const facts = [room.area !== null && squareMetres(room.area), height && `ceiling ${height.toFixed(1)} m`]

  const add = (kind: ItemKind) =>
    update((s) => ({ ...s, added: [...(s.added ?? []), { id: `added-${crypto.randomUUID()}`, kind }] }))
  const remove = (item: RoomElement) =>
    update((s) =>
      item.added
        ? { ...s, added: (s.added ?? []).filter((a) => a.id !== item.id) }
        : { ...s, removedElements: [...(s.removedElements ?? []), item.id] },
    )

  return (
    <>
      <button className="link back-link" onClick={onClear}>
        <BackIcon />
        All rooms
      </button>

      <div className="panel-intro">
        {/* Keyed so each rename starts from the current name. */}
        <RoomName key={`${room.id}-${renaming}`} room={room} renaming={renaming} onRenaming={onRenaming} />
        <p className="muted">{facts.filter(Boolean).join(' · ')}</p>
      </div>

      <label className="panel-field heated-field">
        <span>Heated?</span>
        <select value={room.heated ? 'yes' : 'no'} onChange={(e) => update((s) => ({ ...s, heated: e.target.value === 'yes' }))}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      <section className="room-items" aria-labelledby="items-title">
        <h3 id="items-title">External doors, windows &amp; skylights</h3>
        {room.items.length ? (
          <ul>
            {room.items.map((item, i) => (
              <li key={item.id}>
                <span className="item-icon large">
                  <KindIcon kind={item.kind} />
                </span>
                <span className="room-item-text">
                  <span>{names[i]}</span>
                  <span className="small muted">
                    {item.added ? 'Added by you' : `${item.width.toFixed(1)} × ${item.height.toFixed(1)} m`}
                  </span>
                </span>
                <button className="icon-only" aria-label={`Remove ${names[i]}`} onClick={() => remove(item)}>
                  <BinIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet.</p>
        )}
        <div className="add-items">
          <button className="button subtle" onClick={() => add('door')}>
            + Ext. door
          </button>
          <button className="button subtle" onClick={() => add('window')}>
            + Window
          </button>
          <button className="button subtle" onClick={() => add('skylight')}>
            + Skylight
          </button>
        </div>
      </section>

      <div className="panel-edit-foot">
        <button
          className={room.checked ? 'button checked-toggle on' : 'button checked-toggle'}
          onClick={() => update((s) => ({ ...s, checked: !room.checked }))}
        >
          {room.checked ? 'Checked · undo' : 'Mark room as checked'}
        </button>
        <button
          className="link remove-room"
          onClick={() => {
            update((s) => ({ ...s, removed: true }))
            onClear()
          }}
        >
          Remove this room
        </button>
      </div>
    </>
  )
}
