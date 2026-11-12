// Types for the RoomPlan `CapturedStructure` JSON the iOS app exports as merged.json,
// and for the slimmed-down scan the viewer works with.

export type Vec3 = [number, number, number]

/** A 4×4 transform as 16 numbers in column-major order (RoomPlan's simd_float4x4 encoding). */
export type Mat4 = number[]

/** One wall, door, window, opening or floor as RoomPlan encodes it. */
export interface RawSurface {
  identifier: string
  /** An enum encoded as an object with one key, e.g. {"wall":{}} or {"door":{"isOpen":true}}. */
  category: Record<string, Record<string, unknown> | undefined>
  /** Width, height and depth in metres. Walls, doors and windows usually have a depth of 0. */
  dimensions: Vec3
  transform: Mat4
  parentIdentifier: string | null
  story?: number
  /** Corners in the surface's local XY plane, for non-rectangular walls and for floors. */
  polygonCorners?: Vec3[]
}

/** Furniture and fittings. Only storage is used: built-in wardrobes affect the outline. */
export interface RawObject {
  identifier: string
  category: Record<string, unknown>
  dimensions: Vec3
  transform: Mat4
  story?: number
  attributes?: Record<string, string>
}

export interface RawSection {
  center: Vec3
  label: string
  story?: number
}

/** One room as the app scanned it (a CapturedRoom inside the merged CapturedStructure). Its
 *  surfaces are in the same coordinates as the structure's. */
export interface RawRoom {
  floors?: RawSurface[]
  story?: number
}

export interface RawStructure {
  walls: RawSurface[]
  doors: RawSurface[]
  windows: RawSurface[]
  openings: RawSurface[]
  floors?: RawSurface[]
  objects?: RawObject[]
  /** RoomPlan's guesses at what each area is for. Not used: rooms come from `rooms`. */
  sections?: RawSection[]
  /** The rooms the user scanned, one per "Room done" in the app. */
  rooms?: RawRoom[]
  /** RoomPlan's own format version. */
  version?: number
  /** HeatLossDB's file format version, added by the app and by the website's Save. */
  heatlossdbVersion?: number
  /** In a file saved by the website: the user's edits. */
  edits?: unknown
}

export type ElementKind = 'wall' | 'window' | 'door' | 'opening' | 'floor' | 'ceiling' | 'storage'

export const ELEMENT_KINDS: ElementKind[] = ['wall', 'window', 'door', 'opening', 'floor', 'ceiling', 'storage']

export interface ScanElement {
  id: string
  kind: ElementKind
  width: number
  height: number
  depth: number
  matrix: Mat4
  parentId: string | null
  story: number
  /** Local XY corners, for floors, ceilings and non-rectangular walls. */
  polygon: [number, number][]
  isOpen?: boolean
  /** Added by the viewer, not captured by the scan: walls closing gaps behind built-in storage. */
  synthetic?: boolean
  /** Extra detail from RoomPlan, e.g. "cabinet" or "shelf" for storage. */
  detail?: string
  /** Floors and ceilings: the world x/z outline with notches closed (so it includes built-in
   *  storage the scanner couldn't see into), and its height. Used for drawing and areas. */
  outline?: [number, number][]
  elevation?: number
}

/** A storey's floor outlines in world x/z, as scanned and with narrow notches closed. When the
 *  scan has rooms, this is their floors joined up, not RoomPlan's merged floor, which can
 *  take in space no room covers. */
export interface StoreyOutline {
  story: number
  raw: [number, number][][]
  closed: [number, number][][]
  /** Height of the storey's floor and its average wall height (m). */
  floorY: number
  wallHeight: number
}

/** A room the user scanned: its floor in world x/z. */
export interface ScanRoom {
  /** Its position in the file's `rooms`, which is stable for a given scan. */
  index: number
  story: number
  floor: [number, number][]
}

export interface Scan {
  /** A fingerprint of the scan's element ids, used to key saved fabric settings. */
  hash: string
  elements: ScanElement[]
  stories: number[]
  outlines: StoreyOutline[]
  /** The rooms the user scanned, in the file's order. */
  rooms: ScanRoom[]
  /** The scan as opened, without any edits, so Save can write it back out. Missing for scans
   *  restored from browsers that saved them before Save existed. */
  raw?: RawStructure
}
