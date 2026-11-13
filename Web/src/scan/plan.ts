import { applyAlignment, dominantAngle, IDENTITY, pivotOf, type StoreyAlignment } from './align'
import { matrixOf, polygonArea, wallPointAt } from './geometry'
import { distanceToSegment, type Point2 } from './outline'
import type { ScanElement, Scan } from './types'

/** An external door or window, as found in the scan. */
export interface PlanElement {
  id: string
  kind: 'door' | 'window'
  width: number
  height: number
}

export interface PlanRoom {
  /** Stable for a given scan (the room's place in the file), so the user's edits can key on it. */
  id: string
  story: number
  name: string
  /** The middle of the room's floor, for its label. */
  centre: Point2
  /** Floor area (m²) between the room's walls, or null if it couldn't be measured. */
  area: number | null
  /** The floor between the room's walls as an SVG path, in plan coordinates. Empty if it
   *  couldn't be measured. */
  shape: string
  /** External doors and windows in the room's walls. */
  elements: PlanElement[]
}

export interface PlanLine {
  id: string
  a: Point2
  b: Point2
}

/** A solid stretch of wall between gaps. `end` says which of its ends are the wall's own ends,
 *  rather than the side of a door, window or opening. */
export interface WallPiece {
  a: Point2
  b: Point2
  end: [boolean, boolean]
}

export interface FloorPlan {
  story: number
  outlines: Point2[][]
  /** Each wall's whole line, and its solid pieces once doors, windows and openings are cut out. */
  walls: (PlanLine & { element: ScanElement; pieces: WallPiece[] })[]
  doors: PlanLine[]
  openings: PlanLine[]
  windows: PlanLine[]
  rooms: PlanRoom[]
  /** Floor area of the storey (m²), including built-in storage. */
  area: number
  /** Average wall height (m). */
  wallHeight: number
}

/** Grid size (m) used to measure rooms. */
const CELL = 0.05
/** Walls count as this thick (m) when separating rooms, and are extended by this much at each
 *  end so small gaps where scanned walls don't quite meet don't join rooms together. */
const WALL_HALF_THICKNESS = 0.06
const WALL_END_EXTENSION = 0.1
/** How far (m) either side of a door or window to look for the room it belongs to. */
const ROOM_PROBE = 0.3
/** A wall whose opening is at least this share of its width is only a header, as across a bay
 *  window, so it isn't drawn and doesn't separate rooms. */
const OPEN_WALL = 0.9

/** How far (m) a door, window or opening's centre can be from a wall's line and still be in it.
 *  RoomPlan doesn't always link them to their wall, so they're also matched by position. */
const OPENING_OFFSET = 0.15
/** |cos| of the angle between a door, window or opening and a wall for it to lie along the wall (~15°). */
const PARALLEL = 0.96
/** Bits of wall shorter than this (m) left beside a gap aren't drawn. */
const MIN_PIECE = 0.03
/** A door, window or opening must overlap a wall by this much (m) to be in it. */
const MIN_OVERLAP = 0.05

/** The stretch of the wall (as 0–1 along it) that a door, window or opening takes up, or null
 *  if it isn't in the wall. */
function spanIn(element: ScanElement, wall: ScanElement): [number, number] | null {
  if (!wall.width) return null
  const o = element.matrix
  const w = wall.matrix
  const length = Math.hypot(w[0], w[2]) || 1
  const [ux, uz] = [w[0] / length, w[2] / length]
  const [dx, dz] = [o[12] - w[12], o[14] - w[14]]
  if (element.parentId !== wall.id) {
    const parallel = Math.abs(o[0] * ux + o[2] * uz) / (Math.hypot(o[0], o[2]) || 1)
    if (parallel <= PARALLEL || Math.abs(dx * uz - dz * ux) > OPENING_OFFSET) return null
  }
  const centre = (dx * ux + dz * uz) / wall.width + 0.5
  const half = element.width / 2 / wall.width
  const t0 = Math.max(0, centre - half)
  const t1 = Math.min(1, centre + half)
  // A door just reaching past the end of the next wall along isn't in that wall.
  return (t1 - t0) * wall.width >= MIN_OVERLAP ? [t0, t1] : null
}

/** Whether the opening spans (nearly) all of the wall. */
function opens(opening: ScanElement, wall: ScanElement): boolean {
  const span = spanIn(opening, wall)
  return !!span && span[1] - span[0] >= OPEN_WALL
}

/** What's left of the wall (as 0–1 along it) once its doors, windows and openings are cut out. */
function solidParts(wall: ScanElement, holes: ScanElement[]): [number, number][] {
  const gaps = holes
    .map((hole) => spanIn(hole, wall))
    .filter((span): span is [number, number] => !!span)
    .sort((a, b) => a[0] - b[0])
  const parts: [number, number][] = []
  let from = 0
  for (const [t0, t1] of gaps) {
    if (t0 > from) parts.push([from, t0])
    from = Math.max(from, t1)
  }
  if (from < 1) parts.push([from, 1])
  return parts.filter(([t0, t1]) => (t1 - t0) * wall.width >= MIN_PIECE)
}

function rotate([x, z]: Point2, radians: number): Point2 {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return [x * c - z * s, x * s + z * c]
}

function insidePolygon([x, z]: Point2, polygon: Point2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function lineOf(element: ScanElement): [Point2, Point2] {
  const a = wallPointAt(element, 0)
  const b = wallPointAt(element, 1)
  return [
    [a.x, a.z],
    [b.x, b.z],
  ]
}

function extend([a, b]: [Point2, Point2], by: number): [Point2, Point2] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (!length) return [a, b]
  const dx = ((b[0] - a[0]) / length) * by
  const dz = ((b[1] - a[1]) / length) * by
  return [
    [a[0] - dx, a[1] - dz],
    [b[0] + dx, b[1] + dz],
  ]
}

/** A storey divided into rooms: which room (by index, or -1) owns each grid cell. */
export interface RoomGrid {
  owner: Int16Array
  columns: number
  rows: number
  minX: number
  minZ: number
}

/** Each room's floor area (m²), or null for a room left with no floor. */
export function measureRooms(outlines: Point2[][], walls: [Point2, Point2][], floors: Point2[][]): (number | null)[] {
  const grid = divideRooms(outlines, walls, floors)
  const counts = floors.map(() => 0)
  if (grid) for (const room of grid.owner) if (room >= 0) counts[room]++
  return counts.map((count) => (count ? count * CELL * CELL : null))
}

function bounds(points: Point2[]): [number, number, number, number] {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
}

/**
 * Divides a storey into the rooms the user scanned, on a grid. Each cell inside the storey goes
 * to the room whose floor it's in; where scanned rooms overlap (a scan that carried on through a
 * doorway), to the smaller, as it's the more specific. Cells in no room's floor (under the walls
 * between rooms, or built-in storage) go to the nearest room they can reach without crossing a wall.
 */
export function divideRooms(outlines: Point2[][], walls: [Point2, Point2][], floors: Point2[][]): RoomGrid | null {
  const points = outlines.flat()
  if (!points.length || !floors.length) return null
  const minX = Math.min(...points.map((p) => p[0]))
  const minZ = Math.min(...points.map((p) => p[1]))
  const columns = Math.ceil((Math.max(...points.map((p) => p[0])) - minX) / CELL) + 1
  const rows = Math.ceil((Math.max(...points.map((p) => p[1])) - minZ) / CELL) + 1
  const centreOf = (i: number): Point2 => [minX + ((i % columns) + 0.5) * CELL, minZ + (Math.floor(i / columns) + 0.5) * CELL]

  const free = new Uint8Array(columns * rows)
  for (let i = 0; i < free.length; i++) {
    const p = centreOf(i)
    free[i] = outlines.some((outline) => insidePolygon(p, outline)) ? 1 : 0
  }
  // Inside the storey, walls or not: rooms are claimed on this, so a wall across a room's own
  // floor (a bay, an alcove) doesn't cut it in two.
  const inside = free.slice()
  for (const wall of walls) {
    const [a, b] = extend(wall, WALL_END_EXTENSION)
    const reach = WALL_HALF_THICKNESS + CELL
    const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - minX) / CELL))
    const c1 = Math.min(columns - 1, Math.ceil((Math.max(a[0], b[0]) + reach - minX) / CELL))
    const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - minZ) / CELL))
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(a[1], b[1]) + reach - minZ) / CELL))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * columns + c
        if (free[i] && distanceToSegment(centreOf(i), a, b) <= WALL_HALF_THICKNESS) free[i] = 0
      }
    }
  }

  // Smallest first, so the first floor a cell is found in is the smallest that contains it.
  const order = floors
    .map((floor, room) => ({ floor, room, area: polygonArea(floor), box: bounds(floor) }))
    .filter(({ floor }) => floor.length >= 3)
    .sort((a, b) => a.area - b.area)
  const claim = new Int16Array(columns * rows).fill(-1)
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue
    const p = centreOf(i)
    const found = order.find(
      ({ floor, box }) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3] && insidePolygon(p, floor),
    )
    if (found) claim[i] = found.room
  }
  keepLargestParts(claim, columns)
  // Walls themselves belong to no room.
  const owner = new Int16Array(columns * rows).fill(-1)
  for (let i = 0; i < owner.length; i++) if (free[i]) owner[i] = claim[i]
  // Then spread outwards from every room at once into the cells left over.
  let frontier: number[] = []
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) frontier.push(i)
  while (frontier.length) {
    const next: number[] = []
    for (const i of frontier) {
      const c = i % columns
      for (const j of [c > 0 ? i - 1 : -1, c < columns - 1 ? i + 1 : -1, i - columns, i + columns]) {
        if (j < 0 || j >= free.length || !free[j] || owner[j] >= 0) continue
        owner[j] = owner[i]
        next.push(j)
      }
    }
    frontier = next
  }
  // Walls can still cut a room's own floor into pieces; drop the slivers.
  keepLargestParts(owner, columns, SLIVER_AREA / (CELL * CELL))

  return { owner, columns, rows, minX, minZ }
}

/** The room (by index) owning the cell at p, or -1. */
function roomAt(grid: RoomGrid, [x, z]: Point2): number {
  const c = Math.floor((x - grid.minX) / CELL)
  const r = Math.floor((z - grid.minZ) / CELL)
  if (c < 0 || c >= grid.columns || r < 0 || r >= grid.rows) return -1
  return grid.owner[r * grid.columns + c]
}

/** A room's cells as an SVG path: one rectangle per run of cells along each row. */
export function roomShape(grid: RoomGrid, room: number): string {
  const parts: string[] = []
  for (let r = 0; r < grid.rows; r++) {
    let start = -1
    for (let c = 0; c <= grid.columns; c++) {
      const owned = c < grid.columns && grid.owner[r * grid.columns + c] === room
      if (owned && start < 0) start = c
      if (!owned && start >= 0) {
        const x = grid.minX + start * CELL
        const z = grid.minZ + r * CELL
        parts.push(`M${x.toFixed(2)} ${z.toFixed(2)}h${((c - start) * CELL).toFixed(2)}v${CELL}h${(-(c - start) * CELL).toFixed(2)}z`)
        start = -1
      }
    }
  }
  return parts.join('')
}

/** A room's extra pieces smaller than this (m²) are slivers between walls, not part of it. */
const SLIVER_AREA = 0.25

/**
 * Leaves each room its largest connected part, and any other parts of at least `minCells`. A
 * scan that carried on into other rooms keeps the bits of them the smaller scans didn't reach
 * (along a wall, behind a door); those are cut loose, to go to whichever room they join on to.
 */
function keepLargestParts(owner: Int16Array, columns: number, minCells = Infinity): void {
  const part = new Int32Array(owner.length).fill(-1)
  const parts: { room: number; cells: number[] }[] = []
  for (let start = 0; start < owner.length; start++) {
    if (owner[start] < 0 || part[start] >= 0) continue
    const room = owner[start]
    const cells = [start]
    part[start] = parts.length
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]
      const c = i % columns
      for (const j of [c > 0 ? i - 1 : -1, c < columns - 1 ? i + 1 : -1, i - columns, i + columns]) {
        if (j < 0 || j >= owner.length || owner[j] !== room || part[j] >= 0) continue
        part[j] = parts.length
        cells.push(j)
      }
    }
    parts.push({ room, cells })
  }
  const largest = new Map<number, number>()
  parts.forEach((p, index) => {
    const best = largest.get(p.room)
    if (best === undefined || p.cells.length > parts[best].cells.length) largest.set(p.room, index)
  })
  parts.forEach((p, index) => {
    if (largest.get(p.room) !== index && p.cells.length < minCells) for (const i of p.cells) owner[i] = -1
  })
}

/** The middle of each room's cells, or null for a room with none. */
function roomCentres(grid: RoomGrid, count: number): (Point2 | null)[] {
  const sums = Array.from({ length: count }, () => ({ x: 0, z: 0, n: 0 }))
  grid.owner.forEach((room, i) => {
    if (room < 0) return
    sums[room].x += grid.minX + ((i % grid.columns) + 0.5) * CELL
    sums[room].z += grid.minZ + (Math.floor(i / grid.columns) + 0.5) * CELL
    sums[room].n++
  })
  return sums.map(({ x, z, n }): Point2 | null => (n ? [x / n, z / n] : null))
}

const average = (points: Point2[]): Point2 => [
  points.reduce((s, p) => s + p[0], 0) / (points.length || 1),
  points.reduce((s, p) => s + p[1], 0) / (points.length || 1),
]

/** How far apart (m, down the page) rooms can be and still be read as one row. */
const ROW_DEPTH = 2

/**
 * Lists each storey's rooms in reading order (lowest storey first, then top to bottom and left
 * to right as drawn) and numbers them in that order: "Room 1", "Room 2"… The user can rename them.
 */
function nameRooms(plans: FloorPlan[]): void {
  plans.forEach((plan) => {
    // A room starts a new row when it's more than a row's depth below the row's first room.
    const rows: PlanRoom[][] = []
    for (const room of [...plan.rooms].sort((a, b) => a.centre[1] - b.centre[1])) {
      const row = rows[rows.length - 1]
      if (row && room.centre[1] - row[0].centre[1] <= ROW_DEPTH) row.push(room)
      else rows.push([room])
    }
    plan.rooms = rows.flatMap((row) => row.sort((a, b) => a.centre[0] - b.centre[0]))
  })
  plans.flatMap((plan) => plan.rooms).forEach((room, i) => (room.name = `Room ${i + 1}`))
}

/**
 * Every storey drawn flat, lowest first: lined up with each other, then turned (as PlanSvg turns
 * plans) so the ground floor's main walls run across and down the page.
 */
export function floorPlans(
  scan: Scan,
  alignmentOf: (story: number) => StoreyAlignment = () => IDENTITY,
  /** Whether a door or window is in an external wall; only those are listed per room. */
  isExternal: (id: string) => boolean = () => true,
): FloorPlan[] {
  const storeys = [...scan.outlines].sort((a, b) => a.story - b.story)
  const placers = storeys.map((storey) => {
    const pivot = pivotOf(storey)
    const alignment = alignmentOf(storey.story)
    return (points: Point2[]) => applyAlignment(points, pivot, alignment)
  })
  const ground = storeys.findIndex((storey) => storey.closed.length)
  const rotation = ground < 0 ? 0 : -dominantAngle(storeys[ground].closed.map(placers[ground]))

  const plans = storeys.map((storey, index): FloorPlan => {
    const place = (points: Point2[]) => placers[index](points).map((p) => rotate(p, rotation))
    const line = (element: ScanElement): PlanLine => {
      const [a, b] = place(lineOf(element))
      return { id: element.id, a, b }
    }
    const on = (kind: string) => scan.elements.filter((e) => e.kind === kind && e.story === storey.story)

    const outlines = storey.closed.map(place)
    // A wall whose opening spans (nearly) all of it isn't really there: leave it out.
    const openings = on('opening')
    const holes = [...on('door'), ...on('window'), ...openings]
    const walls = on('wall')
      .filter((element) => !openings.some((o) => opens(o, element)))
      .map((element) => {
        const whole = line(element)
        const at = (t: number): Point2 => [whole.a[0] + t * (whole.b[0] - whole.a[0]), whole.a[1] + t * (whole.b[1] - whole.a[1])]
        const pieces = solidParts(element, holes).map(([t0, t1]): WallPiece => ({ a: at(t0), b: at(t1), end: [t0 === 0, t1 === 1] }))
        return { ...whole, element, pieces }
      })
    // The rooms the user scanned; a scan without them (an older file) is one room per outline.
    const scanned = (scan.rooms ?? []).filter((r) => r.story === storey.story)
    const rooms = scanned.length
      ? scanned.map((r) => ({ id: `scanroom-${r.index}`, floor: place(r.floor) }))
      : outlines.map((floor, k) => ({ id: `outline-${storey.story}-${k}`, floor }))
    const grid = divideRooms(
      outlines,
      walls.map((w) => [w.a, w.b]),
      rooms.map((r) => r.floor),
    )
    const cells = rooms.map(() => 0)
    if (grid) for (const room of grid.owner) if (room >= 0) cells[room]++
    const centres = grid ? roomCentres(grid, rooms.length) : rooms.map(() => null)

    // Each external door and window goes to the room on one side of it or the other.
    const elements: PlanElement[][] = rooms.map(() => [])
    if (grid) {
      for (const element of [...on('door'), ...on('window')]) {
        if (!isExternal(element.id)) continue
        const m = matrixOf(element).elements
        const normal = Math.hypot(m[8], m[10]) || 1
        const [nx, nz] = [m[8] / normal, m[10] / normal]
        const probes = place([
          [m[12] + nx * ROOM_PROBE, m[14] + nz * ROOM_PROBE],
          [m[12] - nx * ROOM_PROBE, m[14] - nz * ROOM_PROBE],
        ])
        const room = probes.map((p) => roomAt(grid, p)).find((r) => r >= 0)
        if (room === undefined) continue
        elements[room].push({ id: element.id, kind: element.kind as 'door' | 'window', width: element.width, height: element.height })
      }
    }

    return {
      story: storey.story,
      outlines,
      walls,
      doors: on('door').map(line),
      openings: openings.map(line),
      windows: on('window').map(line),
      rooms: rooms.map((room, k) => ({
        id: room.id,
        story: storey.story,
        name: '',
        centre: centres[k] ?? average(room.floor),
        area: cells[k] ? cells[k] * CELL * CELL : null,
        shape: grid ? roomShape(grid, k) : '',
        elements: elements[k],
      })),
      area: outlines.reduce((total, outline) => total + polygonArea(outline), 0),
      wallHeight: storey.wallHeight,
    }
  })
  nameRooms(plans)
  return plans
}
