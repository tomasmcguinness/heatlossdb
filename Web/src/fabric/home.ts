import type { ElementSettings, HomeFabric, RoomFabric, RoomSettings } from './store'

/** One answer to a Home fabric question. */
export interface Choice {
  value: string
  label: string
}

export const NOT_SURE = 'not-sure'

const notSure: Choice = { value: NOT_SURE, label: 'Not sure' }

// The questions and answers from the Home fabric design (design/HomeFabric.dc.html): broad,
// whole-home answers in plain language. Differences are set later, element by element.

export const PROPERTY_TYPES: Choice[] = [
  { value: 'detached', label: 'Detached' },
  { value: 'semi-detached', label: 'Semi-detached' },
  { value: 'terraced', label: 'Terraced' },
]

export const AGE_BANDS: Choice[] = [
  { value: 'pre-1919', label: 'Before 1919' },
  { value: '1919-1944', label: '1919–1944' },
  { value: '1945-1964', label: '1945–1964' },
  { value: '1965-1982', label: '1965–1982' },
  { value: '1983-2002', label: '1983–2002' },
  { value: '2003-', label: '2003 or later' },
  notSure,
]

export const WALLS: Choice[] = [
  { value: 'solid', label: 'Solid brick or stone' },
  { value: 'cavity-unfilled', label: 'Cavity, not filled' },
  { value: 'cavity-filled', label: 'Cavity, filled' },
  { value: 'timber-frame', label: 'Timber frame' },
  notSure,
]

export const LOFTS: Choice[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'none', label: 'No loft (flat roof or room in roof)' },
  notSure,
]

/** Asked when the loft is insulated: whether it's above the joists, i.e. about 200 mm or more
 *  rather than 100 mm or less. Below 100 mm matters most for heat loss. */
export const LOFT_DEPTHS: Choice[] = [
  { value: 'below', label: 'No, level or below' },
  { value: 'above', label: 'Yes, well above' },
  notSure,
]

/** Skylights are assumed to match. */
export const WINDOWS: Choice[] = [
  { value: 'single', label: 'Single glazed' },
  { value: 'double-older', label: 'Double, older' },
  { value: 'double', label: 'Double, 2002 or newer' },
  { value: 'triple', label: 'Triple glazed' },
  notSure,
]

export const DOORS: Choice[] = [
  { value: 'solid-wood', label: 'Solid wood' },
  { value: 'part-glass', label: 'Part glass' },
  { value: 'composite', label: 'Modern composite or uPVC' },
  notSure,
]

export const FLOOR_TYPES: Choice[] = [
  { value: 'suspended-timber', label: 'Wooden floorboards' },
  { value: 'solid', label: 'Solid concrete' },
  notSure,
]

export const FLOOR_INSULATION: Choice[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  notSure,
]

/** The answers with "Not sure" about insulation read as none: an uninsulated loft (or loft
 *  insulation only up to the joists) and an uninsulated floor. Assuming the worst keeps heat
 *  losses from being underestimated. Unanswered questions are left as they are. */
export function assumingNoInsulation(home: HomeFabric): HomeFabric {
  return {
    ...home,
    loft: home.loft === NOT_SURE ? 'no' : home.loft,
    loftDepth: home.loftDepth === NOT_SURE ? 'below' : home.loftDepth,
    floorInsulation: home.floorInsulation === NOT_SURE ? 'no' : home.floorInsulation,
  }
}

/** The answer's label, or undefined if it isn't one of the choices. */
export function labelIn(choices: Choice[], value: string | undefined): string | undefined {
  return choices.find((c) => c.value === value)?.label
}

/** The main questions, as counted in "x of 7 answered". Follow-ups (loft depth, floor
 *  insulation) aren't counted. */
const MAIN_QUESTIONS: [keyof HomeFabric, Choice[]][] = [
  ['propertyType', PROPERTY_TYPES],
  ['ageBand', AGE_BANDS],
  ['walls', WALLS],
  ['loft', LOFTS],
  ['windows', WINDOWS],
  ['doors', DOORS],
  ['floorType', FLOOR_TYPES],
]

export const QUESTION_COUNT = MAIN_QUESTIONS.length

export function answeredCount(home: HomeFabric): number {
  return MAIN_QUESTIONS.filter(([key, choices]) => labelIn(choices, home[key] as string | undefined)).length
}

/** Whether the user has applied Home fabric. Anything left blank uses typical values for the
 *  home's age, so an applied fabric counts as set however many questions were answered. */
export const isHomeFabricSet = (home: HomeFabric) => home.applied === true

/** Elements the user has given their own fabric details or U-value, which applying Home fabric
 *  replaces. Roles (external, party, internal) aren't fabric, so they're kept. */
export const hasCustomFabric = (settings: ElementSettings) =>
  Object.keys(settings.fields ?? {}).length > 0 || settings.uValue !== undefined

/** Where a room sits, which decides which of its fabric can differ from the home's: only the
 *  top storey has a roof above it, and only the ground storey has a floor on the ground. A room
 *  in a single-storey home is both. */
export interface RoomPlacement {
  ground: boolean
  top: boolean
}

/** The parts of a room's fabric answered with one of the choices above. */
export type RoomFabricChoice = Exclude<keyof RoomFabric, 'airChangesPerHour'>

const CEILING_KEYS: RoomFabricChoice[] = ['loft', 'loftDepth']
const FLOOR_KEYS: RoomFabricChoice[] = ['floorType', 'floorInsulation']

/** Whether a room in this placement can have its own value for this part of its fabric. */
export function canChange(placement: RoomPlacement, key: RoomFabricChoice): boolean {
  if (CEILING_KEYS.includes(key)) return placement.top
  if (FLOOR_KEYS.includes(key)) return placement.ground
  return true
}

export interface Resolved {
  value: string | undefined
  /** Whether the value is the room's or item's own, or the home's. */
  own: boolean
}

/** One part of a room's fabric: its own answer where it has one, else the home's. Loft depth
 *  follows the loft: a room with its own loft answer doesn't take the home's depth. */
export function roomFabricValue(home: HomeFabric, settings: RoomSettings | undefined, placement: RoomPlacement, key: RoomFabricChoice): Resolved {
  const fabric = settings?.fabric ?? {}
  const own = canChange(placement, key) ? fabric[key] : undefined
  if (own) return { value: own, own: true }
  if (key === 'loftDepth' && canChange(placement, 'loft') && fabric.loft) return { value: undefined, own: true }
  return { value: home[key], own: false }
}

/** The highest air changes per hour accepted. Even very draughty rooms are well below it. */
export const MAX_AIR_CHANGES = 20

/** A room's air changes per hour: its own where set, else the home's. Any storey can differ. */
export function roomAirChanges(home: HomeFabric, settings: RoomSettings | undefined): { value: number | undefined; own: boolean } {
  const own = settings?.fabric?.airChangesPerHour
  if (own !== undefined) return { value: own, own: true }
  return { value: home.airChangesPerHour, own: false }
}

/** Typed air changes per hour: undefined when blank, null when it isn't a number above 0 and up
 *  to MAX_AIR_CHANGES. A comma is read as a decimal point. */
export function parseAirChanges(text: string): number | undefined | null {
  const trimmed = text.trim().replace(',', '.')
  if (!trimmed) return undefined
  if (!/^\d*\.?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value > 0 && value <= MAX_AIR_CHANGES ? value : null
}

export const AIR_CHANGES_ERROR = `Enter a number above 0 and up to ${MAX_AIR_CHANGES}, like 1.5, or leave it blank.`

/** Such as "1.5 per hour", or undefined when not set. */
export const formatAirChanges = (value: number | undefined) => (value === undefined ? undefined : `${value} per hour`)

/** How a cavity wall is drawn: its cavity insulated, or left empty. */
export type WallCavity = 'filled' | 'empty'

/** Whether a room's outside walls are a cavity wall, filled or empty, by its own answer or else the
 *  home's. Null for anything else (solid, timber frame, not sure, unanswered) and until Home fabric
 *  has been applied. Any storey can have its own walls, so where the room is doesn't matter. */
export function wallCavity(home: HomeFabric, settings: RoomSettings | undefined): WallCavity | null {
  if (!isHomeFabricSet(home)) return null
  const { value } = roomFabricValue(home, settings, { ground: true, top: true }, 'walls')
  return value === 'cavity-filled' ? 'filled' : value === 'cavity-unfilled' ? 'empty' : null
}

/** The insulation the side view shows for the whole home, from Home fabric. */
export interface HomeInsulation {
  /** Loft insulation: deep where it comes up above the joists, shallow where it's up to them or
   *  the depth isn't known. Null with no loft insulation (or no loft). */
  loft: 'deep' | 'shallow' | null
  walls: WallCavity | null
  floor: boolean
}

/** What the side view shows: nothing until Home fabric has been applied, then the insulation it
 *  says is there. "Not sure" shows nothing, as nothing is known to be there. */
export function homeInsulation(home: HomeFabric): HomeInsulation {
  if (!isHomeFabricSet(home)) return { loft: null, walls: null, floor: false }
  return {
    loft: home.loft === 'yes' ? (home.loftDepth === 'above' ? 'deep' : 'shallow') : null,
    walls: wallCavity(home, undefined),
    floor: home.floorInsulation === 'yes',
  }
}

/** The answers a door, window or skylight's own fabric is chosen from. */
export const itemChoices = (kind: 'door' | 'window' | 'skylight'): Choice[] => (kind === 'door' ? DOORS : WINDOWS)

/** A door's type, or a window's or skylight's glazing: its own where set, else the home's. */
export function itemFabricValue(home: HomeFabric, settings: RoomSettings | undefined, item: { id: string; kind: 'door' | 'window' | 'skylight' }): Resolved {
  const own = settings?.itemFabric?.[item.id]
  if (own) return { value: own, own: true }
  return { value: item.kind === 'door' ? home.doors : home.windows, own: false }
}

/** Whether the room, or any of its doors and windows, is built differently from the home. */
export const hasRoomFabric = (settings: RoomSettings | undefined) =>
  Object.keys(settings?.fabric ?? {}).length > 0 || Object.keys(settings?.itemFabric ?? {}).length > 0

/** Changes that applying Home fabric replaces: each element with its own fabric, each room with
 *  its own fabric, and each door or window with its own. */
export function customFabricCount(elements: Record<string, ElementSettings>, rooms: Record<string, RoomSettings>): number {
  const ownElements = Object.values(elements).filter(hasCustomFabric).length
  const ownRooms = Object.values(rooms).filter((r) => Object.keys(r.fabric ?? {}).length > 0).length
  const ownItems = Object.values(rooms).reduce((total, r) => total + Object.keys(r.itemFabric ?? {}).length, 0)
  return ownElements + ownRooms + ownItems
}
