import { authFetch } from '../api'
import { editorFloors, squareMetres, type EditorFloor } from '../components/editor/model'
import { formatHeatLoss, formatTargetTemperature } from '../fabric/heatLoss'
import {
  AGE_BANDS,
  FLOOR_TYPES,
  formatAirChanges,
  labelIn,
  LOFTS,
  PROPERTY_TYPES,
  roomAirChanges,
  roomFabricValue,
  WALLS,
  WINDOWS,
  type RoomPlacement,
} from '../fabric/home'
import { isFabricDocument, type EditedRoom, type FabricDocument, type HomeFabric, type RoomSettings } from '../fabric/store'
import { autoAlign } from '../scan/align'
import { classify } from '../scan/classify'
import { indexScan, parseScan } from '../scan/parse'
import type { Scan } from '../scan/types'
import { isHeatPumpData, type HeatPumpData } from '../match/heatPump'

/**
 * Homes shared by link (/h/<id>). The link opens a snapshot taken when the owner shared it: their
 * saved edits, with room names left out unless they allowed them, and the floor plan as it was then.
 * Its id isn't the survey's, so it can't be used to open or change the survey.
 */

/** The share id in a link such as /h/AbC…, or null on any other page. */
export function shareIdFromPath(pathname: string): string | null {
  return /^\/h\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname)?.[1] ?? null
}

export interface ShareLink {
  id: string
  /** The link to hand out. */
  url: string
}

/** Shares the saved home by link, or updates what its link shows. The home must already be saved
 *  to the user's account and have its share details. */
export async function createShareLink(surveyId: string): Promise<ShareLink> {
  const response = await authFetch(`/api/me/homes/${surveyId}/share-link`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Making the link failed: ${response.status}`)
  return (await response.json()) as ShareLink
}

export interface SharedHome {
  /** What the home is listed under, such as "Detached, 1945–64, insulated home". */
  name: string
  sharedAt: string
  /** The first part of its postcode, such as "B91". */
  postcodeDistrict: string | null
  /** Its heat loss and heat pump figures, when the owner gave them. */
  heatPump: HeatPumpData | null
  scan: Scan
  edits: FabricDocument
}

/** Thrown when there's no home shared under the link. */
export class SharedHomeNotFoundError extends Error {
  constructor() {
    super('This link isn’t valid, or the home is no longer shared.')
  }
}

/** Loads a shared home: its snapshot, then the floor plan it was shared with. */
export async function loadSharedHome(id: string): Promise<SharedHome> {
  const [homeResponse, scanResponse] = await Promise.all([fetch(`/api/shared/${id}`), fetch(`/api/shared/${id}/scan`)])
  if (homeResponse.status === 404 || scanResponse.status === 404) throw new SharedHomeNotFoundError()
  if (!homeResponse.ok || !scanResponse.ok) throw new Error('Couldn’t load this home. Try again in a moment.')
  const home = (await homeResponse.json()) as { name?: unknown; sharedAt?: unknown; edits?: unknown; postcodeDistrict?: unknown; heatPump?: unknown }
  if (typeof home.name !== 'string' || typeof home.sharedAt !== 'string' || !isFabricDocument(home.edits)) {
    throw new Error('This shared home couldn’t be read.')
  }
  return {
    name: home.name,
    sharedAt: home.sharedAt,
    postcodeDistrict: typeof home.postcodeDistrict === 'string' ? home.postcodeDistrict : null,
    heatPump: isHeatPumpData(home.heatPump) ? home.heatPump : null,
    scan: parseScan(await scanResponse.json()),
    edits: home.edits,
  }
}

/**
 * The shared home's storeys with its rooms as the owner corrected them, drawn as the editor draws
 * them. Built here rather than in the editor's store, which keeps the visitor's own scan and saves
 * itself to their browser.
 */
export function sharedFloors(scan: Scan, edits: FabricDocument): EditorFloor[] {
  return editorFloors(scan, {
    elements: edits.elements ?? {},
    autoRoles: classify(scan),
    byId: indexScan(scan).byId,
    alignment: { ...autoAlign(scan), ...edits.alignment },
    rooms: edits.rooms ?? {},
  })
}

/** Where the room sits: only the top storey has a roof above, only the lowest a floor on the ground. */
export function placementOf(floors: EditorFloor[], room: EditedRoom): RoomPlacement {
  return { ground: floors[0]?.plan.story === room.story, top: floors.at(-1)?.plan.story === room.story }
}

/** Heat loss per square metre of floor, or undefined without both. */
export function heatLossPerSquareMetre(room: Pick<EditedRoom, 'heated' | 'heatLossW' | 'area'>): number | undefined {
  if (!room.heated || room.heatLossW === undefined || !room.area) return undefined
  return room.heatLossW / room.area
}

/** "Insulated", "Not insulated", "No loft"… for a loft answer. */
function loftLabel(value: string | undefined): string | undefined {
  if (value === 'none') return 'No loft'
  if (value === 'no') return 'Not insulated'
  if (value === 'yes') return 'Insulated'
  return labelIn(LOFTS, value)
}

/** One line of a room's details: a label, its value, and whether the room differs from the home. */
export interface RoomFact {
  label: string
  value: string
  /** The room's own fabric, not the home's. */
  own?: boolean
}

/** What a visitor sees about a room: its size, heating, heat loss and how it's built. */
export function roomFacts(room: EditedRoom, home: HomeFabric, settings: RoomSettings | undefined, placement: RoomPlacement): RoomFact[] {
  const facts: RoomFact[] = []
  if (room.area !== null) facts.push({ label: 'Floor area', value: squareMetres(room.area) })
  facts.push({ label: 'Heated', value: room.heated ? 'Yes' : 'No' })
  if (room.heated) {
    if (room.targetTemperature !== undefined) facts.push({ label: 'Design temperature', value: formatTargetTemperature(room.targetTemperature) })
    if (room.heatLossW !== undefined) facts.push({ label: 'Heat loss', value: formatHeatLoss(room.heatLossW) })
    const perSquareMetre = heatLossPerSquareMetre(room)
    if (perSquareMetre !== undefined) facts.push({ label: 'Heat loss per m²', value: `${Math.round(perSquareMetre)} W/m²` })
  }
  const air = roomAirChanges(home, settings)
  const airText = formatAirChanges(air.value)
  if (airText) facts.push({ label: 'Air changes', value: airText, own: air.own })

  const fabric = (label: string, key: 'walls' | 'loft' | 'floorType', format: (value: string | undefined) => string | undefined) => {
    const { value, own } = roomFabricValue(home, settings, placement, key)
    const text = format(value)
    if (text) facts.push({ label, value: text, own })
  }
  fabric('Outside walls', 'walls', (v) => labelIn(WALLS, v))
  if (placement.top) fabric('Loft', 'loft', loftLabel)
  if (placement.ground) fabric('Floor', 'floorType', (v) => labelIn(FLOOR_TYPES, v))
  const windows = labelIn(WINDOWS, home.windows)
  if (windows) facts.push({ label: 'Windows', value: windows })
  return facts
}

/** The home's reported heat loss: the total of the rooms that have a figure, and how many do. */
export function reportedTotals(rooms: EditedRoom[]): { heatLossW: number; withFigures: number; heated: number } {
  const heated = rooms.filter((r) => r.heated)
  const withFigures = heated.filter((r) => r.heatLossW !== undefined)
  return { heatLossW: withFigures.reduce((total, r) => total + r.heatLossW!, 0), withFigures: withFigures.length, heated: heated.length }
}

/** Watts as kilowatts, to one decimal place: "6.2 kW". */
export const kilowatts = (watts: number) => `${(watts / 1000).toFixed(1)} kW`

const temperature = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} °C`

/** The home at a glance: what it is, where, its size and how it's built. */
export function homeFacts(home: HomeFabric, district: string | null, floors: EditorFloor[]): RoomFact[] {
  const rooms = floors.flatMap((f) => f.rooms)
  const area = rooms.reduce((total, r) => total + (r.area ?? 0), 0)
  const facts: RoomFact[] = []
  const add = (label: string, value: string | undefined) => value && facts.push({ label, value })
  add('Type', labelIn(PROPERTY_TYPES, home.propertyType))
  add('Built', home.ageBand === 'not-sure' ? undefined : labelIn(AGE_BANDS, home.ageBand))
  add('Area', district ?? undefined)
  add('Floor area', area > 0 ? squareMetres(area) : undefined)
  add('Storeys', String(floors.length))
  add('Rooms', String(rooms.length))
  add('Outside walls', labelIn(WALLS, home.walls))
  add('Loft', loftLabel(home.loft))
  add('Windows', labelIn(WINDOWS, home.windows))
  add('Floor', labelIn(FLOOR_TYPES, home.floorType))
  return facts
}

const BASIS: Record<string, string> = { survey: 'From a heat loss survey', measured: 'Measured from the running heat pump' }

/** The home's heat loss: the design figure the owner gave, and the room-by-room total. */
export function heatLossFacts(heatPump: HeatPumpData | null, rooms: EditedRoom[], floorArea: number): RoomFact[] {
  const facts: RoomFact[] = []
  const totals = reportedTotals(rooms)
  const design = heatPump?.designHeatLossW
  if (design !== undefined) {
    facts.push({ label: 'Design heat loss', value: kilowatts(design) })
    if (floorArea > 0) facts.push({ label: 'Per m² of floor', value: `${Math.round(design / floorArea)} W/m²` })
    const outdoor = heatPump?.designOutdoorTemperature
    const indoor = heatPump?.designIndoorTemperature
    if (outdoor !== undefined) {
      facts.push({ label: 'Designed for', value: `${temperature(outdoor)} outside${indoor !== undefined ? `, ${temperature(indoor)} inside` : ''}` })
    }
    const basis = heatPump?.heatLossBasis && BASIS[heatPump.heatLossBasis]
    if (basis) facts.push({ label: 'Worked out', value: basis })
  }
  if (totals.withFigures > 0) {
    facts.push({ label: 'Rooms added up', value: kilowatts(totals.heatLossW) })
    if (design === undefined && floorArea > 0) facts.push({ label: 'Per m² of floor', value: `${Math.round(totals.heatLossW / floorArea)} W/m²` })
  }
  return facts
}

const EMITTERS: Record<string, string> = { radiators: 'Radiators', underfloor: 'Underfloor heating', mixed: 'Radiators and underfloor' }
const kilowattHours = (value: number) => `${Math.round(value).toLocaleString('en-GB')} kWh`

/** The heat pump fitted and how it runs, from what the owner shared. */
export function heatPumpFacts(heatPump: HeatPumpData | null): RoomFact[] {
  const facts: RoomFact[] = []
  const fitted = heatPump?.heatPump
  if (fitted) {
    const name = [fitted.make, fitted.model].filter((part) => part.trim()).join(' ')
    if (name) facts.push({ label: 'Make and model', value: name })
    facts.push({ label: 'Output', value: `${fitted.capacityKw} kW` })
  }
  if (heatPump?.designFlowTemperature !== undefined) facts.push({ label: 'Flow temperature', value: temperature(heatPump.designFlowTemperature) })
  const emitters = heatPump?.emitters && (EMITTERS[heatPump.emitters] ?? heatPump.emitters)
  if (emitters) facts.push({ label: 'Heats with', value: emitters })
  const annual = heatPump?.annual
  if (annual) {
    facts.push({ label: 'Measured SCOP', value: annual.scop.toFixed(1) })
    facts.push({ label: 'Heat a year', value: kilowattHours(annual.heatDeliveredKwh) })
    facts.push({ label: 'Electricity a year', value: kilowattHours(annual.electricityKwh) })
  }
  return facts
}
