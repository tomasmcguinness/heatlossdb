import { useRef, useState } from 'react'
import {
  FLOOR_INSULATION,
  FLOOR_TYPES,
  hasRoomFabric,
  isHomeFabricSet,
  itemChoices,
  itemFabricValue,
  labelIn,
  LOFT_DEPTHS,
  LOFTS,
  WALLS,
  WINDOWS,
  type Choice,
  type RoomPlacement,
} from '../../fabric/home'
import { useFabric, type EditedRoom, type HomeFabric, type RoomElement, type RoomFabric, type RoomSettings } from '../../fabric/store'
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
  /** Opens Home fabric. */
  onFabric: () => void
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

/** How the loft reads on the Home fabric card, such as "Insulated, well above the joists". */
function loftFact(home: HomeFabric): string | undefined {
  if (home.loft === 'none') return 'No loft'
  if (home.loft === 'no') return 'Not insulated'
  if (home.loft !== 'yes') return labelIn(LOFTS, home.loft)
  const depth = home.loftDepth === 'below' ? 'up to the joists' : home.loftDepth === 'above' ? 'well above the joists' : null
  return depth ? `Insulated, ${depth}` : 'Insulated'
}

/** The Home fabric card's four facts. */
const fabricFacts = (home: HomeFabric): [string, string | undefined][] => [
  ['Loft', loftFact(home)],
  ['Outside walls', labelIn(WALLS, home.walls)],
  ['Windows', labelIn(WINDOWS, home.windows)],
  ['Ground floor', labelIn(FLOOR_TYPES, home.floorType)],
]

function AllRooms({ floors, floor, actions, onFabric }: RoomPanelProps) {
  const home = useFabric((s) => s.home)
  const settings = useFabric((s) => s.rooms)
  const shown = floor ? [floor] : floors
  const rooms = shown.flatMap((f) => f.rooms.map((room) => ({ room, floorName: f.name })))

  return (
    <>
      <div className="panel-intro">
        <h2>Your home</h2>
        <p className="muted">Check each room’s doors, windows and skylights. Walls, roof and floor are set for the whole home in Home fabric. Change them room by room if parts are built differently.</p>
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
          <button className="button subtle" onClick={onFabric}>
            {isHomeFabricSet(home) ? 'Edit' : 'Set up'}
          </button>
        </div>
        {!isHomeFabricSet(home) && (
          <p className="small muted">Start here: tell us how your home is built. It applies to every room.</p>
        )}
        <dl className="fabric-facts">
          {fabricFacts(home).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={value ? '' : 'muted'}>{value ?? 'Not set'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel-rooms" aria-labelledby="rooms-title">
        <h3 id="rooms-title">{floor ? `${floor.name} rooms` : 'All rooms'}</h3>
        {rooms.length ? (
          <ul className="panel-room-list">
            {rooms.map(({ room: r, floorName }) => (
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
                    {isHomeFabricSet(home) && hasRoomFabric(settings[r.id]) &&<span className="tag tag-set">Own fabric</span>}
                    <span className={r.checked ? 'status-checked' : 'muted small'}>{r.checked ? 'Checked' : 'To check'}</span>
                  </span>
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

/** A choice of one part of the fabric, starting on "Same as home". */
function FabricOptions({
  choices,
  own,
  inherited,
  onChange,
  label,
}: {
  choices: Choice[]
  /** The room's or item's own answer, if it has one. */
  own: string | undefined
  /** What it is when it's the same as the home. */
  inherited: string | undefined
  onChange: (value: string | undefined) => void
  /** For a choice without a visible label. */
  label?: string
}) {
  return (
    <select aria-label={label} value={own ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Same as home ({labelIn(choices, inherited) ?? 'not set'})</option>
      {choices.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

function FabricField({ label, ...props }: Omit<Parameters<typeof FabricOptions>[0], 'label'> & { label: string }) {
  return (
    <label className="panel-field">
      <span>{label}</span>
      <FabricOptions {...props} />
    </label>
  )
}

/** The room's walls, and its ceiling (top storey) and floor (ground storey), where they're
 *  built differently from the rest of the home. Differences only make sense once the home's
 *  fabric is set (and applying it would clear them), so until then it asks for that first. */
function RoomFabricSection({
  room,
  settings,
  placement,
  onFabric,
}: {
  room: EditedRoom
  settings: RoomSettings | undefined
  placement: RoomPlacement
  onFabric: () => void
}) {
  const setRoom = useFabric((s) => s.setRoom)
  const home = useFabric((s) => s.home)
  const own = (key: keyof RoomFabric) => settings?.fabric?.[key]
  const set = (patch: RoomFabric) => setRoom(room.id, (s) => ({ ...s, fabric: { ...s.fabric, ...patch } }))

  if (!isHomeFabricSet(home)) {
    return (
      <section className="room-fabric" aria-labelledby="room-fabric-title">
        <h3 id="room-fabric-title">Fabric in this room</h3>
        <div className="room-fabric-locked">
          <p className="small muted">Set up Home fabric first. Then you can change anything this room does differently.</p>
          <button className="button subtle" onClick={onFabric}>
            Set up Home fabric
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="room-fabric" aria-labelledby="room-fabric-title">
      <div>
        <h3 id="room-fabric-title">Fabric in this room</h3>
        <p className="small muted">Only change these if this room is built differently, such as an extension.</p>
      </div>
      <FabricField label="Outside walls" choices={WALLS} own={own('walls')} inherited={home.walls} onChange={(v) => set({ walls: v })} />
      {placement.top && (
        <>
          <FabricField
            label="Loft insulated?"
            choices={LOFTS}
            own={own('loft')}
            inherited={home.loft}
            // The depth only applies to an insulated loft, and goes with the room's own answer.
            onChange={(v) => set({ loft: v, loftDepth: v === 'yes' ? own('loftDepth') : undefined })}
          />
          {own('loft') === 'yes' && (
            <FabricField
              label="Insulation above the joists?"
              choices={LOFT_DEPTHS}
              own={own('loftDepth')}
              inherited={home.loft === 'yes' ? home.loftDepth : undefined}
              onChange={(v) => set({ loftDepth: v })}
            />
          )}
        </>
      )}
      {placement.ground && (
        <>
          <FabricField label="Floor" choices={FLOOR_TYPES} own={own('floorType')} inherited={home.floorType} onChange={(v) => set({ floorType: v })} />
          <FabricField
            label="Floor insulated?"
            choices={FLOOR_INSULATION}
            own={own('floorInsulation')}
            inherited={home.floorInsulation}
            onChange={(v) => set({ floorInsulation: v })}
          />
        </>
      )}
    </section>
  )
}

/** The selected room: its name, whether it's heated, and its doors, windows and skylights, all
 *  editable. */
function RoomDetails({ floors, room, renaming, onRenaming, onClear, onFabric }: RoomPanelProps & { room: EditedRoom }) {
  const setRoom = useFabric((s) => s.setRoom)
  const home = useFabric((s) => s.home)
  // Doors and windows can only differ from the home once its fabric is set.
  const fabricSet = isHomeFabricSet(home)
  const settings = useFabric((s) => s.rooms[room.id])
  // Floors are lowest first: only the top one has a roof above, only the lowest a floor on the ground.
  const placement: RoomPlacement = { ground: floors[0]?.plan.story === room.story, top: floors.at(-1)?.plan.story === room.story }
  const update = (patch: Parameters<typeof setRoom>[1]) => setRoom(room.id, patch)
  const names = itemNames(room.items)
  const height = floors.find((f) => f.plan.story === room.story)?.plan.wallHeight
  const facts = [room.area !== null && squareMetres(room.area), height && `ceiling ${height.toFixed(1)} m`]

  const add = (kind: ItemKind) =>
    update((s) => ({ ...s, added: [...(s.added ?? []), { id: `added-${crypto.randomUUID()}`, kind }] }))
  // A removed door or window takes its own fabric with it.
  const remove = (item: RoomElement) =>
    update((s) => {
      const itemFabric = { ...s.itemFabric }
      delete itemFabric[item.id]
      return item.added
        ? { ...s, itemFabric, added: (s.added ?? []).filter((a) => a.id !== item.id) }
        : { ...s, itemFabric, removedElements: [...(s.removedElements ?? []), item.id] }
    })
  const setItemFabric = (item: RoomElement, value: string | undefined) =>
    update((s) => ({ ...s, itemFabric: { ...s.itemFabric, [item.id]: value ?? '' } }))

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

      <RoomFabricSection room={room} settings={settings} placement={placement} onFabric={onFabric} />

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
                  {fabricSet && (
                    <FabricOptions
                      label={`${names[i]}: ${item.kind === 'door' ? 'door type' : 'glazing'}`}
                      choices={itemChoices(item.kind)}
                      own={settings?.itemFabric?.[item.id]}
                      inherited={itemFabricValue(home, undefined, item).value}
                      onChange={(v) => setItemFabric(item, v)}
                    />
                  )}
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
      </div>
    </>
  )
}
