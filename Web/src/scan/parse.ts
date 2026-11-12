import { Matrix4, Vector3 } from 'three'
import { wallPointAt, worldOutlineXZ } from './geometry'
import { closeOutline, distanceBesideSegment, edgesOf, joinFloors, type Point2 } from './outline'
import type { ElementKind, RawObject, RawStructure, RawSurface, Scan, ScanElement, ScanRoom, StoreyOutline } from './types'

export class ScanParseError extends Error {}

/** The newest HeatLossDB file format this website reads. */
export const HEATLOSSDB_VERSION = 1

const SURFACE_KINDS: Record<string, ElementKind> = {
  wall: 'wall',
  door: 'door',
  window: 'window',
  opening: 'opening',
  floor: 'floor',
}

function categoryKey(surface: RawSurface): string {
  return Object.keys(surface.category ?? {})[0] ?? 'unknown'
}

function isSurface(value: unknown): value is RawSurface {
  const s = value as RawSurface
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof s.identifier === 'string' &&
    Array.isArray(s.dimensions) &&
    s.dimensions.length === 3 &&
    Array.isArray(s.transform) &&
    s.transform.length === 16
  )
}

function toElement(surface: RawSurface): ScanElement | null {
  const kind = SURFACE_KINDS[categoryKey(surface)]
  if (!kind) return null
  const [width, height, depth] = surface.dimensions
  return {
    id: surface.identifier,
    kind,
    width,
    height,
    depth,
    matrix: surface.transform,
    parentId: surface.parentIdentifier ?? null,
    story: surface.story ?? 0,
    polygon: (surface.polygonCorners ?? []).map(([x, y]) => [x, y]),
    isOpen: kind === 'door' ? Boolean(surface.category.door?.isOpen) : undefined,
  }
}

/**
 * RoomPlan captures no ceilings, so each storey gets a ceiling element at the top of its walls,
 * using the floor's outline. The top storey's ceiling is the main roof; a lower storey's ceiling
 * can be marked as a roof where it isn't covered by the storey above (e.g. an extension).
 */
function ceilingsFor(floors: ScanElement[], walls: ScanElement[]): ScanElement[] {
  return floors.map((floor) => {
    const storeyWalls = walls.filter((w) => w.story === floor.story)
    const height = storeyWalls.length
      ? storeyWalls.reduce((sum, w) => sum + w.height, 0) / storeyWalls.length
      : 2.4
    const matrix = new Matrix4().makeTranslation(0, height, 0).multiply(new Matrix4().fromArray(floor.matrix))
    return {
      ...floor,
      elevation: floor.elevation === undefined ? undefined : floor.elevation + height,
      id: `ceiling-${floor.id}`,
      kind: 'ceiling' as const,
      matrix: matrix.toArray(),
    }
  })
}

/** FNV-1a over the sorted element ids: stable for a given scan, cheap to compute. */
function fingerprint(ids: string[]): string {
  let hash = 0x811c9dc5
  for (const ch of [...ids].sort().join('|')) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function storageElement(object: RawObject): ScanElement | null {
  if (!object.category || !('storage' in object.category)) return null
  if (!Array.isArray(object.dimensions) || !Array.isArray(object.transform)) return null
  const [width, height, depth] = object.dimensions
  return {
    id: object.identifier,
    kind: 'storage',
    width,
    height,
    depth,
    matrix: object.transform,
    parentId: null,
    story: object.story ?? 0,
    polygon: [],
    detail: object.attributes?.StorageType,
  }
}

/** The rooms the user scanned, each with its floor. */
function roomsOf(raw: RawStructure): ScanRoom[] {
  return (raw.rooms ?? []).flatMap((room, index) => {
    const floor = (room.floors ?? [])
      .filter(isSurface)
      .map(toElement)
      .find((e) => e?.kind === 'floor' && e.polygon.length >= 3)
    return floor ? [{ index, story: room.story ?? floor.story, floor: worldOutlineXZ(floor) }] : []
  })
}

function outlinesFor(stories: number[], floors: ScanElement[], walls: ScanElement[], rooms: ScanRoom[]): StoreyOutline[] {
  return stories.map((story) => {
    const storeyFloors = floors.filter((f) => f.story === story)
    const storeyWalls = walls.filter((w) => w.story === story)
    const storeyRooms = rooms.filter((r) => r.story === story)
    // RoomPlan's merged floor can take in space no room covers, so the rooms' floors are used
    // where there are any.
    const raw = storeyRooms.length ? joinFloors(storeyRooms.map((r) => r.floor)) : storeyFloors.map(worldOutlineXZ)
    return {
      story,
      raw,
      closed: raw.map((outline) => closeOutline(outline)),
      floorY: storeyFloors.length ? new Vector3().applyMatrix4(new Matrix4().fromArray(storeyFloors[0].matrix)).y : 0,
      wallHeight: storeyWalls.length ? storeyWalls.reduce((sum, w) => sum + w.height, 0) / storeyWalls.length : 2.4,
    }
  })
}

/** How far (m) an outline point may be from a wall and still count as covered by it. */
const COVER_TOLERANCE = 0.25
/** Shorter uncovered stretches are rounding at corners, not real gaps. */
const MIN_INFILL_LENGTH = 0.2
const SAMPLE_STEP = 0.05
/** |cos| of the angle between a wall and an outline edge for the wall to run along it (~15°). */
const PARALLEL = 0.96

/**
 * Walls closing gaps in the envelope. Where the closed outline crosses a notch (typically the
 * open end of a built-in wardrobe RoomPlan traced around), no scanned wall lies along it; add one
 * there at the storey's wall height so the envelope is complete.
 */
function infillWalls(outlines: StoreyOutline[], walls: ScanElement[]): ScanElement[] {
  const added: ScanElement[] = []
  for (const outline of outlines) {
    const segments = walls
      .filter((w) => w.story === outline.story)
      .map((w): [Point2, Point2] => {
        const a = wallPointAt(w, 0)
        const b = wallPointAt(w, 1)
        return [
          [a.x, a.z],
          [b.x, b.z],
        ]
      })
    if (!segments.length) continue
    // Only walls running along the edge cover it. The ends of a wardrobe's side walls touch
    // its open end, but don't close it.
    const coveredAlong = (p: Point2, edge: [number, number]) =>
      segments.some(([a, b]) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (!length) return false
        const parallel = Math.abs(((b[0] - a[0]) * edge[0] + (b[1] - a[1]) * edge[1]) / length)
        return parallel > PARALLEL && distanceBesideSegment(p, a, b) <= COVER_TOLERANCE
      })

    outline.closed.forEach((closed, outlineIndex) => {
      edgesOf(closed).forEach(([a, b], edgeIndex) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (!length) return
        const direction: [number, number] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
        const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP))
        const runs: [number, number][] = []
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps
          if (coveredAlong([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], direction)) continue
          const last = runs[runs.length - 1]
          if (last && last[1] === k / steps) last[1] = (k + 1) / steps
          else runs.push([k / steps, (k + 1) / steps])
        }
        runs.forEach(([t0, t1], runIndex) => {
          const width = (t1 - t0) * length
          if (width < MIN_INFILL_LENGTH) return
          const [dx, dz] = direction
          const tm = (t0 + t1) / 2
          const cx = a[0] + tm * (b[0] - a[0])
          const cz = a[1] + tm * (b[1] - a[1])
          const cy = outline.floorY + outline.wallHeight / 2
          added.push({
            id: `infill-${outline.story}-${outlineIndex}-${edgeIndex}-${runIndex}`,
            kind: 'wall',
            width,
            height: outline.wallHeight,
            depth: 0,
            // Columns: along the wall, up, and the wall's normal (along × up).
            matrix: [dx, 0, dz, 0, 0, 1, 0, 0, -dz, 0, dx, 0, cx, cy, cz, 1],
            parentId: null,
            story: outline.story,
            polygon: [],
            synthetic: true,
          })
        })
      })
    })
  }
  return added
}

/** Parses merged.json (a RoomPlan CapturedStructure) into the viewer's scan model. */
export function parseScan(json: unknown): Scan {
  const raw = json as RawStructure
  if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.walls)) {
    throw new ScanParseError("This doesn't look like a RoomPlan merged.json file: it has no walls.")
  }
  if (typeof raw.heatlossdbVersion === 'number' && raw.heatlossdbVersion > HEATLOSSDB_VERSION) {
    throw new ScanParseError('This file was made by a newer version of HeatLossDB. Reload the page and try again.')
  }

  const surfaces = [
    ...raw.walls,
    ...(raw.doors ?? []),
    ...(raw.windows ?? []),
    ...(raw.openings ?? []),
    ...(raw.floors ?? []),
  ].filter(isSurface)

  const elements = surfaces.map(toElement).filter((e): e is ScanElement => e !== null)
  if (!elements.some((e) => e.kind === 'wall')) {
    throw new ScanParseError('The scan has no readable walls.')
  }

  const walls = elements.filter((e) => e.kind === 'wall')
  const floors = elements.filter((e) => e.kind === 'floor' && e.polygon.length >= 3)
  const storage = (raw.objects ?? []).map(storageElement).filter((e): e is ScanElement => e !== null)
  const stories = [...new Set(elements.map((e) => e.story))].sort((a, b) => a - b)
  const rooms = roomsOf(raw)
  const outlines = outlinesFor(stories, floors, walls, rooms)

  // Draw floors from the closed outline, so built-in storage doesn't leave holes in them. An
  // outline with no floor of its own (rooms that don't join up) gets one copied from the storey's.
  const extraFloors: ScanElement[] = []
  for (const outline of outlines) {
    const storeyFloors = floors.filter((f) => f.story === outline.story)
    outline.closed.forEach((closed, index) => {
      const floor =
        storeyFloors[index] ??
        (storeyFloors[0] && { ...storeyFloors[0], id: `${storeyFloors[0].id}-part-${index}`, synthetic: true })
      if (!floor) return
      floor.outline = closed
      floor.elevation = outline.floorY
      if (!storeyFloors.includes(floor)) extraFloors.push(floor)
    })
    // RoomPlan's floors beyond the rooms' outlines would draw the space no room covers.
    for (const floor of storeyFloors.slice(outline.closed.length)) if (rooms.length) floor.outline = []
  }
  const allFloors = [...floors, ...extraFloors]

  return {
    // Only RoomPlan's own ids, so settings survive changes to what the viewer derives.
    hash: fingerprint(elements.map((e) => e.id)),
    elements: [...elements, ...extraFloors, ...infillWalls(outlines, walls), ...ceilingsFor(allFloors, walls), ...storage],
    stories,
    outlines,
    rooms,
    raw: { ...raw, edits: undefined },
  }
}

export function indexScan(scan: Scan) {
  const byId = new Map(scan.elements.map((e) => [e.id, e]))
  const childrenOf = new Map<string, ScanElement[]>()
  for (const e of scan.elements) {
    if (!e.parentId) continue
    const list = childrenOf.get(e.parentId) ?? []
    list.push(e)
    childrenOf.set(e.parentId, list)
  }
  return { byId, childrenOf }
}
