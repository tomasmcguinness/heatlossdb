import { authFetch } from '../api'
import { editorFloors, squareMetres, type EditorFloor } from '../components/editor/model'
import { formatHeatLoss, formatTargetTemperature } from '../fabric/heatLoss'
import {
  FLOOR_TYPES,
  formatAirChanges,
  labelIn,
  LOFTS,
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
  const home = (await homeResponse.json()) as { name?: unknown; sharedAt?: unknown; edits?: unknown }
  if (typeof home.name !== 'string' || typeof home.sharedAt !== 'string' || !isFabricDocument(home.edits)) {
    throw new Error('This shared home couldn’t be read.')
  }
  return { name: home.name, sharedAt: home.sharedAt, scan: parseScan(await scanResponse.json()), edits: home.edits }
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
