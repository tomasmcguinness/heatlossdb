import { create } from 'zustand'
import { autoAlign, IDENTITY, type StoreyAlignment } from '../scan/align'
import { classify, type Role } from '../scan/classify'
import { indexScan } from '../scan/parse'
import type { PlanElement, PlanRoom } from '../scan/plan'
import { ELEMENT_KINDS, type ElementKind, type Scan, type ScanElement } from '../scan/types'

/** What the user has set on one element. Anything left unset falls back to the defaults. */
export interface ElementSettings {
  role?: Role
  fields?: Record<string, string>
  uValue?: number
}

/** A door, window or skylight the user added to a room because the scan missed it. */
export interface AddedElement {
  id: string
  kind: 'door' | 'window' | 'skylight'
}

/** What the user has checked or corrected on one room. */
export interface RoomSettings {
  name?: string
  /** Rooms are heated unless the user says otherwise. */
  heated?: boolean
  checked?: boolean
  /** Scanned doors and windows the user says aren't there. */
  removedElements?: string[]
  added?: AddedElement[]
  /** Where the room is built differently from the rest of the home, such as an extension.
   *  Anything unset is the same as Home fabric. */
  fabric?: RoomFabric
  /** Door types (doors) and glazing (windows and skylights) that differ from Home fabric, keyed
   *  by the scanned or added item's id. Values come from DOORS and WINDOWS in fabric/home.ts. */
  itemFabric?: Record<string, string>
}

/** The parts of Home fabric a room can change. Values are the same as HomeFabric's. Only rooms
 *  on the top storey have a ceiling (loft) to change, and only ground storey rooms a floor. */
export interface RoomFabric {
  walls?: string
  loft?: string
  loftDepth?: string
  floorType?: string
  floorInsulation?: string
}

/** How the whole home is built, as answered in Home fabric. Values come from fabric/home.ts;
 *  anything unanswered uses typical values for the home's age. */
export interface HomeFabric {
  propertyType?: string
  ageBand?: string
  walls?: string
  loft?: string
  /** Only when the loft is insulated: whether it comes up above the joists. */
  loftDepth?: string
  windows?: string
  doors?: string
  floorType?: string
  floorInsulation?: string
  /** Set once the user has applied their answers to the whole home. */
  applied?: boolean
}

export interface KindDefaults {
  fields: Record<string, string>
  uValue?: number
}

/** The saved and exported form of a property's fabric. It becomes the API payload later. */
export interface FabricDocument {
  format: 'heatlossdb.fabric'
  version: 1
  scanHash: string
  defaults: Record<ElementKind, KindDefaults>
  elements: Record<string, ElementSettings>
  /** How each storey is moved to line up with the one below, keyed by RoomPlan storey number. */
  alignment?: Record<string, StoreyAlignment>
  /** The user's checks and corrections, keyed by room id. */
  rooms?: Record<string, RoomSettings>
  home?: HomeFabric
}

export type CameraPreset = 'perspective' | 'plan'

export interface ViewOptions {
  camera: CameraPreset
  hiddenStories: number[]
  spreadStoreys: boolean
  externalOnly: boolean
  showCeilings: boolean
  showStorage: boolean
}

export type SidebarTab = 'element' | 'defaults' | 'storeys' | 'summary'

interface FabricState {
  scan: Scan | null
  /** The file the scan was opened from, when it came from one. */
  scanName: string | null
  byId: Map<string, ScanElement>
  childrenOf: Map<string, ScanElement[]>
  autoRoles: Record<string, Role>
  defaults: Record<ElementKind, KindDefaults>
  elements: Record<string, ElementSettings>
  alignment: Record<number, StoreyAlignment>
  rooms: Record<string, RoomSettings>
  home: HomeFabric
  /** The automatic alignment, so the user can return to it after nudging. */
  autoAlignment: Record<number, StoreyAlignment>
  selectedId: string | null
  hoveredId: string | null
  view: ViewOptions
  tab: SidebarTab
  /** Bumped to ask the viewer to re-frame the building. */
  viewResetToken: number

  loadScan: (scan: Scan, name?: string) => void
  closeScan: () => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  setTab: (tab: SidebarTab) => void
  setView: (view: Partial<ViewOptions>) => void
  /** Re-frames the building, optionally switching between the 3D and plan (top-down) views. */
  resetView: (camera?: CameraPreset) => void

  setRole: (id: string, role: Role | undefined) => void
  setField: (id: string, key: string, value: string | undefined) => void
  setUValue: (id: string, value: number | undefined) => void
  resetElement: (id: string) => void
  setDefaultField: (kind: ElementKind, key: string, value: string | undefined) => void
  setDefaultUValue: (kind: ElementKind, value: number | undefined) => void
  setAlignment: (story: number, alignment: StoreyAlignment) => void
  setRoom: (id: string, update: (current: RoomSettings) => RoomSettings) => void
  /** Applies Home fabric to the whole home, replacing any element's own fabric details and
   *  U-value (but not its role), and any room's, door's or window's own fabric. */
  applyHome: (home: HomeFabric) => void

  exportFabric: () => FabricDocument | null
  importFabric: (doc: FabricDocument) => void
}

const emptyDefaults = (): Record<ElementKind, KindDefaults> =>
  Object.fromEntries(ELEMENT_KINDS.map((k) => [k, { fields: {} }])) as Record<ElementKind, KindDefaults>

const defaultView = (): ViewOptions => ({
  camera: 'perspective',
  hiddenStories: [],
  spreadStoreys: false,
  externalOnly: false,
  showCeilings: false,
  showStorage: false,
})

// MARK: - Browser storage (a per-viewer convenience; the API becomes the source of truth later)

const SCAN_KEY = 'heatlossdb.scan'
const fabricKey = (hash: string) => `heatlossdb.fabric.${hash}`

function readStorage<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or blocked (private windows); the page still works without it.
  }
}

export function isFabricDocument(value: unknown): value is FabricDocument {
  const doc = value as FabricDocument
  return (
    typeof doc === 'object' &&
    doc !== null &&
    doc.format === 'heatlossdb.fabric' &&
    doc.version === 1 &&
    typeof doc.elements === 'object' &&
    typeof doc.defaults === 'object'
  )
}

/** Drops empty settings so "reset" really removes an element from the saved document. */
function tidy(settings: ElementSettings): ElementSettings | undefined {
  const fields = Object.fromEntries(Object.entries(settings.fields ?? {}).filter(([, v]) => v))
  const next: ElementSettings = {}
  if (settings.role) next.role = settings.role
  if (Object.keys(fields).length) next.fields = fields
  if (settings.uValue !== undefined && Number.isFinite(settings.uValue)) next.uValue = settings.uValue
  return Object.keys(next).length ? next : undefined
}

/** Drops "same as home" (empty) fabric answers, and the fabric records once they're empty. */
function tidyRoom(settings: RoomSettings): RoomSettings {
  const next = { ...settings }
  const fabric = Object.fromEntries(Object.entries(settings.fabric ?? {}).filter(([, v]) => v))
  const itemFabric = Object.fromEntries(Object.entries(settings.itemFabric ?? {}).filter(([, v]) => v))
  if (Object.keys(fabric).length) next.fabric = fabric
  else delete next.fabric
  if (Object.keys(itemFabric).length) next.itemFabric = itemFabric
  else delete next.itemFabric
  return next
}

function withElement(
  elements: Record<string, ElementSettings>,
  id: string,
  update: (current: ElementSettings) => ElementSettings,
): Record<string, ElementSettings> {
  const next = { ...elements }
  const tidied = tidy(update(elements[id] ?? {}))
  if (tidied) next[id] = tidied
  else delete next[id]
  return next
}

export const useFabric = create<FabricState>()((set, get) => ({
  scan: null,
  scanName: null,
  byId: new Map(),
  childrenOf: new Map(),
  autoRoles: {},
  defaults: emptyDefaults(),
  elements: {},
  alignment: {},
  rooms: {},
  home: {},
  autoAlignment: {},
  selectedId: null,
  hoveredId: null,
  view: defaultView(),
  tab: 'summary',
  viewResetToken: 0,

  loadScan: (scan, name) => {
    const saved = readStorage<FabricDocument>(fabricKey(scan.hash))
    const valid = saved && isFabricDocument(saved) ? saved : null
    writeStorage(SCAN_KEY, scan)
    const automatic = autoAlign(scan)
    set({
      scan,
      scanName: name ?? null,
      ...indexScan(scan),
      autoRoles: classify(scan),
      defaults: { ...emptyDefaults(), ...valid?.defaults },
      elements: valid?.elements ?? {},
      alignment: { ...automatic, ...valid?.alignment },
      rooms: valid?.rooms ?? {},
      home: valid?.home ?? {},
      autoAlignment: automatic,
      selectedId: null,
      hoveredId: null,
      view: defaultView(),
      tab: 'summary',
      viewResetToken: get().viewResetToken + 1,
    })
  },

  closeScan: () => {
    writeStorage(SCAN_KEY, null)
    set({ scan: null, scanName: null, byId: new Map(), childrenOf: new Map(), autoRoles: {}, selectedId: null, hoveredId: null })
  },

  select: (id) => set(id ? { selectedId: id, tab: 'element' } : { selectedId: null }),
  hover: (id) => set({ hoveredId: id }),
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view: { ...get().view, ...view } }),
  resetView: (camera) =>
    set({ view: { ...get().view, camera: camera ?? get().view.camera }, viewResetToken: get().viewResetToken + 1 }),

  setRole: (id, role) => set({ elements: withElement(get().elements, id, (e) => ({ ...e, role })) }),
  setField: (id, key, value) =>
    set({ elements: withElement(get().elements, id, (e) => ({ ...e, fields: { ...e.fields, [key]: value ?? '' } })) }),
  setUValue: (id, uValue) => set({ elements: withElement(get().elements, id, (e) => ({ ...e, uValue })) }),
  resetElement: (id) => set({ elements: withElement(get().elements, id, () => ({})) }),

  setDefaultField: (kind, key, value) => {
    const current = get().defaults[kind]
    const fields = { ...current.fields }
    if (value) fields[key] = value
    else delete fields[key]
    set({ defaults: { ...get().defaults, [kind]: { ...current, fields } } })
  },
  setDefaultUValue: (kind, uValue) => {
    const current = get().defaults[kind]
    set({ defaults: { ...get().defaults, [kind]: { ...current, uValue } } })
  },

  setAlignment: (story, alignment) => set({ alignment: { ...get().alignment, [story]: alignment } }),
  setRoom: (id, update) => set({ rooms: { ...get().rooms, [id]: tidyRoom(update(get().rooms[id] ?? {})) } }),
  applyHome: (home) => {
    const elements = Object.fromEntries(
      Object.entries(get().elements).flatMap(([id, settings]) => (settings.role ? [[id, { role: settings.role }]] : [])),
    )
    // Rooms keep their checks and corrections, but not their own fabric.
    const rooms = Object.fromEntries(
      Object.entries(get().rooms).map(([id, settings]) => [id, tidyRoom({ ...settings, fabric: undefined, itemFabric: undefined })]),
    )
    set({ home: { ...home, applied: true }, elements, rooms })
  },

  exportFabric: () => {
    const { scan, defaults, elements, alignment, rooms, home } = get()
    if (!scan) return null
    return { format: 'heatlossdb.fabric', version: 1, scanHash: scan.hash, defaults, elements, alignment, rooms, home }
  },

  importFabric: (doc) => {
    // Only keep settings for elements that exist in this scan.
    const { byId } = get()
    const elements = Object.fromEntries(Object.entries(doc.elements).filter(([id]) => byId.has(id)))
    set({
      defaults: { ...emptyDefaults(), ...doc.defaults },
      elements,
      alignment: { ...get().autoAlignment, ...doc.alignment },
      rooms: doc.rooms ?? {},
      home: doc.home ?? {},
    })
  },
}))

// Save fabric settings whenever they change.
useFabric.subscribe((state, previous) => {
  if (!state.scan) return
  if (
    state.defaults === previous.defaults &&
    state.elements === previous.elements &&
    state.alignment === previous.alignment &&
    state.rooms === previous.rooms &&
    state.home === previous.home
  ) {
    return
  }
  writeStorage(fabricKey(state.scan.hash), state.exportFabric())
})

/** The last scan opened in this browser, so a reload doesn't lose it. */
export function restoreLastScan(): Scan | null {
  const scan = readStorage<Scan>(SCAN_KEY)
  return scan && Array.isArray(scan.elements) && typeof scan.hash === 'string' ? scan : null
}

// MARK: - Derived values

/** An element's role: the user's choice, else (for doors, windows and openings) its wall's
 *  role, else the automatic guess. */
export function effectiveRole(state: Pick<FabricState, 'elements' | 'autoRoles' | 'byId'>, id: string): Role {
  const own = state.elements[id]?.role
  if (own) return own
  const element = state.byId.get(id)
  if (element?.parentId && state.byId.has(element.parentId)) return effectiveRole(state, element.parentId)
  return state.autoRoles[id] ?? 'internal'
}

export interface FieldValue {
  value: string | undefined
  source: 'element' | 'default' | 'unset'
}

export function effectiveField(
  state: Pick<FabricState, 'elements' | 'defaults'>,
  element: ScanElement,
  key: string,
): FieldValue {
  const own = state.elements[element.id]?.fields?.[key]
  if (own) return { value: own, source: 'element' }
  const fallback = state.defaults[element.kind]?.fields[key]
  if (fallback) return { value: fallback, source: 'default' }
  return { value: undefined, source: 'unset' }
}

export function effectiveUValue(
  state: Pick<FabricState, 'elements' | 'defaults'>,
  element: ScanElement,
): { value: number | undefined; source: FieldValue['source'] } {
  const own = state.elements[element.id]?.uValue
  if (own !== undefined) return { value: own, source: 'element' }
  const fallback = state.defaults[element.kind]?.uValue
  if (fallback !== undefined) return { value: fallback, source: 'default' }
  return { value: undefined, source: 'unset' }
}

export function storeyName(stories: number[], story: number): string {
  const names = ['Ground floor', 'First floor', 'Second floor', 'Third floor']
  const index = stories.indexOf(story)
  return names[index] ?? `Storey ${index + 1}`
}

export function alignmentOf(state: Pick<FabricState, 'alignment'>, story: number): StoreyAlignment {
  return state.alignment[story] ?? IDENTITY
}

export type RoomElement = (PlanElement & { added?: false }) | (AddedElement & { added: true })

export interface EditedRoom extends PlanRoom {
  /** What the scan called the room, before any rename. */
  scannedName: string
  heated: boolean
  checked: boolean
  /** Scanned doors and windows the user hasn't removed, then the ones they added. */
  items: RoomElement[]
}

/** A room as the user has corrected it. */
export function editedRoom(room: PlanRoom, settings: RoomSettings = {}): EditedRoom {
  const removed = new Set(settings.removedElements ?? [])
  return {
    ...room,
    name: settings.name?.trim() || room.name,
    scannedName: room.name,
    heated: settings.heated ?? true,
    checked: settings.checked ?? false,
    items: [
      ...room.elements.filter((e) => !removed.has(e.id)).map((e) => ({ ...e, added: false as const })),
      ...(settings.added ?? []).map((e) => ({ ...e, added: true as const })),
    ],
  }
}
