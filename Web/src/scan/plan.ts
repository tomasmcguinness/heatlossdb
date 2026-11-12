import { applyAlignment, dominantAngle, IDENTITY, pivotOf, type StoreyAlignment } from './align'
import { matrixOf, polygonArea, wallPointAt } from './geometry'
import { distanceToSegment, type Point2 } from './outline'
import type { ScanElement, Scan } from './types'

/** RoomPlan's section labels, as people say them. */
const ROOM_NAMES: Record<string, string> = {
  bathroom: 'Bathroom',
  bedroom: 'Bedroom',
  diningRoom: 'Dining room',
  kitchen: 'Kitchen',
  livingRoom: 'Living room',
  unidentified: 'Room',
}

/** An external door or window, as found in the scan. */
export interface PlanElement {
  id: string
  kind: 'door' | 'window'
  width: number
  height: number
}

export interface PlanRoom {
  /** Stable for a given scan (storey and RoomPlan section), so the user's edits can key on it. */
  id: string
  story: number
  name: string
  /** Where RoomPlan placed the room's label. */
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

export interface FloorPlan {
  story: number
  outlines: Point2[][]
  walls: (PlanLine & { element: ScanElement })[]
  doors: PlanLine[]
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
 *  window, so it doesn't separate rooms. */
const OPEN_WALL = 0.9

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

/** A storey divided into rooms: which room (by label index, or -1) owns each grid cell. */
export interface RoomGrid {
  owner: Int16Array
  columns: number
  rows: number
  minX: number
  minZ: number
}

/** Each room's floor area (m²), or null for a label that claimed no floor. */
export function measureRooms(outlines: Point2[][], walls: [Point2, Point2][], centres: Point2[]): (number | null)[] {
  const grid = divideRooms(outlines, walls, centres)
  const counts = centres.map(() => 0)
  if (grid) for (const room of grid.owner) if (room >= 0) counts[room]++
  return counts.map((count) => (count ? count * CELL * CELL : null))
}

/**
 * Divides a storey into rooms. RoomPlan gives one floor outline per storey, so the storey is
 * divided up on a grid: walls block, and each label claims the cells it can reach first. Rooms
 * joined by an archway, or open plan, are split halfway between their labels.
 */
export function divideRooms(outlines: Point2[][], walls: [Point2, Point2][], centres: Point2[]): RoomGrid | null {
  const points = outlines.flat()
  if (!points.length || !centres.length) return null
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

  // Spread outwards from every label at once, so each cell goes to the nearest one it can reach.
  const owner = new Int16Array(columns * rows).fill(-1)
  let frontier: number[] = []
  centres.forEach(([x, z], room) => {
    const seed = nearestFree(free, columns, rows, Math.floor((x - minX) / CELL), Math.floor((z - minZ) / CELL))
    if (seed !== null && owner[seed] < 0) {
      owner[seed] = room
      frontier.push(seed)
    }
  })
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

  return { owner, columns, rows, minX, minZ }
}

/** The room (label index) owning the cell at p, or -1. */
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

/** The free cell closest to (c, r), looking up to half a metre away, for labels placed on a wall. */
function nearestFree(free: Uint8Array, columns: number, rows: number, c: number, r: number): number | null {
  const limit = Math.round(0.5 / CELL)
  for (let radius = 0; radius <= limit; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue
        const cc = c + dc
        const rr = r + dr
        if (cc >= 0 && cc < columns && rr >= 0 && rr < rows && free[rr * columns + cc]) return rr * columns + cc
      }
    }
  }
  return null
}

/** How far apart (m, down the page) rooms can be and still be read as one row. */
const ROW_DEPTH = 2

/**
 * Names the rooms, numbering any name that repeats across the home ("Bedroom 1", "Bedroom 2")
 * and listing each storey's rooms in reading order: lowest storey first, then top to bottom
 * and left to right as drawn.
 */
function nameRooms(plans: FloorPlan[], labels: string[][]): void {
  plans.forEach((plan, p) => {
    plan.rooms.forEach((room, r) => (room.name = ROOM_NAMES[labels[p][r]] ?? sentenceCase(labels[p][r])))
    // A room starts a new row when it's more than a row's depth below the row's first room.
    const rows: PlanRoom[][] = []
    for (const room of [...plan.rooms].sort((a, b) => a.centre[1] - b.centre[1])) {
      const row = rows[rows.length - 1]
      if (row && room.centre[1] - row[0].centre[1] <= ROW_DEPTH) row.push(room)
      else rows.push([room])
    }
    plan.rooms = rows.flatMap((row) => row.sort((a, b) => a.centre[0] - b.centre[0]))
  })
  const all = plans.flatMap((plan) => plan.rooms)
  const counts: Record<string, number> = {}
  for (const room of all) counts[room.name] = (counts[room.name] ?? 0) + 1
  const seen: Record<string, number> = {}
  for (const room of all) {
    if (counts[room.name] < 2) continue
    seen[room.name] = (seen[room.name] ?? 0) + 1
    room.name = `${room.name} ${seen[room.name]}`
  }
}

function sentenceCase(label: string): string {
  const words = label.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
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

  const labels: string[][] = []
  const plans = storeys.map((storey, index): FloorPlan => {
    const place = (points: Point2[]) => placers[index](points).map((p) => rotate(p, rotation))
    const line = (element: ScanElement): PlanLine => {
      const [a, b] = place(lineOf(element))
      return { id: element.id, a, b }
    }
    const on = (kind: string) => scan.elements.filter((e) => e.kind === kind && e.story === storey.story)

    const outlines = storey.closed.map(place)
    const walls = on('wall').map((element) => ({ ...line(element), element }))
    const sections = scan.sections.map((s, i) => ({ s, i })).filter(({ s }) => (s.story ?? 0) === storey.story)
    const centres = sections.map(({ s }) => place([[s.center[0], s.center[2]]])[0])
    labels.push(sections.map(({ s }) => s.label))
    const widthOf = new Map(walls.map((w) => [w.id, w.element.width]))
    const open = new Set(
      on('opening')
        .filter((o) => o.parentId && o.width >= OPEN_WALL * (widthOf.get(o.parentId) ?? Infinity))
        .map((o) => o.parentId),
    )
    const grid = divideRooms(
      outlines,
      walls.filter((w) => !open.has(w.id)).map((w) => [w.a, w.b]),
      centres,
    )
    const cells = centres.map(() => 0)
    if (grid) for (const room of grid.owner) if (room >= 0) cells[room]++

    // Each external door and window goes to the room on one side of it or the other.
    const elements: PlanElement[][] = centres.map(() => [])
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
      doors: [...on('door'), ...on('opening')].map(line),
      windows: on('window').map(line),
      rooms: centres.map((centre, k) => ({
        id: `room-${storey.story}-${sections[k].i}`,
        story: storey.story,
        name: '',
        centre,
        area: cells[k] ? cells[k] * CELL * CELL : null,
        shape: grid ? roomShape(grid, k) : '',
        elements: elements[k],
      })),
      area: outlines.reduce((total, outline) => total + polygonArea(outline), 0),
      wallHeight: storey.wallHeight,
    }
  })
  nameRooms(plans, labels)
  return plans
}
