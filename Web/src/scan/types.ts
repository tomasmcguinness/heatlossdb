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

export interface RawStructure {
  walls: RawSurface[]
  doors: RawSurface[]
  windows: RawSurface[]
  openings: RawSurface[]
  floors?: RawSurface[]
  objects?: RawObject[]
  sections?: RawSection[]
  version?: number
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

/** A storey's floor outlines in world x/z, as scanned and with narrow notches closed. */
export interface StoreyOutline {
  story: number
  raw: [number, number][][]
  closed: [number, number][][]
  /** Height of the storey's floor and its average wall height (m). */
  floorY: number
  wallHeight: number
}

export interface Scan {
  /** A fingerprint of the scan's element ids, used to key saved fabric settings. */
  hash: string
  elements: ScanElement[]
  stories: number[]
  outlines: StoreyOutline[]
  sections: RawSection[]
}
