import { distanceToSegment, edgesOf, type Point2 } from './outline'
import type { Scan, StoreyOutline } from './types'

/**
 * How a storey is moved to line up with the one below: rotated about its own centre (the
 * pivot), then shifted. RoomPlan can place storeys out of line when they're scanned separately
 * or tracking drifts on the stairs.
 */
export interface StoreyAlignment {
  /** Rotation about the vertical axis, in degrees (three.js rotation.y convention). */
  rotation: number
  dx: number
  dz: number
}

export const IDENTITY: StoreyAlignment = { rotation: 0, dx: 0, dz: 0 }

export function isIdentity(a: StoreyAlignment): boolean {
  return Math.abs(a.rotation) < 1e-6 && Math.abs(a.dx) < 1e-6 && Math.abs(a.dz) < 1e-6
}

/** The storey's centre in x/z: the average of its closed outline corners. */
export function pivotOf(outline: StoreyOutline): Point2 {
  const points = outline.closed.flat()
  if (!points.length) return [0, 0]
  const sum = points.reduce((acc, [x, z]) => [acc[0] + x, acc[1] + z], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

/** Rotation about the vertical axis matching three.js: x' = x cos + z sin, z' = −x sin + z cos. */
function rotate([x, z]: Point2, radians: number): Point2 {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return [x * c + z * s, -x * s + z * c]
}

export function applyAlignment(points: Point2[], pivot: Point2, a: StoreyAlignment): Point2[] {
  const radians = (a.rotation * Math.PI) / 180
  return points.map(([x, z]) => {
    const [rx, rz] = rotate([x - pivot[0], z - pivot[1]], radians)
    return [rx + pivot[0] + a.dx, rz + pivot[1] + a.dz]
  })
}

/** Points every `step` metres around each outline. */
function sampleOutlines(outlines: Point2[][], step: number): Point2[] {
  const points: Point2[] = []
  for (const outline of outlines) {
    for (const [a, b] of edgesOf(outline)) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.round(length / step))
      for (let k = 0; k < n; k++) {
        const t = k / n
        points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
      }
    }
  }
  return points
}

/** The building's main direction (mod 90°), weighted by edge length: walls are mostly square. */
export function dominantAngle(outlines: Point2[][]): number {
  let sin = 0
  let cos = 0
  for (const outline of outlines) {
    for (const [a, b] of edgesOf(outline)) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
      sin += length * Math.sin(4 * angle)
      cos += length * Math.cos(4 * angle)
    }
  }
  return Math.atan2(sin, cos) / 4
}

/** Points further than this (m) from the storey below count the same; overhangs don't dominate. */
const TRUNCATE = 0.5
const CELL = 0.05

/** Distances to the lower storey's outline, precomputed on a grid so scoring is cheap. */
class DistanceField {
  private readonly values: Float32Array
  private readonly width: number
  private readonly height: number
  private readonly minX: number
  private readonly minZ: number

  constructor(outlines: Point2[][], margin: number) {
    const points = outlines.flat()
    const xs = points.map((p) => p[0])
    const zs = points.map((p) => p[1])
    this.minX = Math.min(...xs) - margin
    this.minZ = Math.min(...zs) - margin
    this.width = Math.ceil((Math.max(...xs) + margin - this.minX) / CELL) + 1
    this.height = Math.ceil((Math.max(...zs) + margin - this.minZ) / CELL) + 1
    this.values = new Float32Array(this.width * this.height).fill(TRUNCATE)

    // Only cells near an edge can be closer than TRUNCATE, so fill around each edge.
    const reach = Math.ceil(TRUNCATE / CELL)
    for (const outline of outlines) {
      for (const [a, b] of edgesOf(outline)) {
        const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - this.minX) / CELL) - reach)
        const i1 = Math.min(this.width - 1, Math.ceil((Math.max(a[0], b[0]) - this.minX) / CELL) + reach)
        const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - this.minZ) / CELL) - reach)
        const j1 = Math.min(this.height - 1, Math.ceil((Math.max(a[1], b[1]) - this.minZ) / CELL) + reach)
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const d = distanceToSegment([this.minX + i * CELL, this.minZ + j * CELL], a, b)
            const index = j * this.width + i
            if (d < this.values[index]) this.values[index] = d
          }
        }
      }
    }
  }

  at(x: number, z: number): number {
    const i = Math.round((x - this.minX) / CELL)
    const j = Math.round((z - this.minZ) / CELL)
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return TRUNCATE
    return this.values[j * this.width + i]
  }
}

/** Mean truncated distance from the (moved) upper outline to the lower one: lower is better. */
function score(field: DistanceField, centred: Point2[], pivot: Point2, radians: number, dx: number, dz: number) {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  let sum = 0
  for (const [x, z] of centred) sum += field.at(x * c + z * s + pivot[0] + dx, -x * s + z * c + pivot[1] + dz)
  return sum / centred.length
}

/** Searches shifts within ±range in steps of `step` around (dx, dz) for the best score. */
function searchShift(
  field: DistanceField,
  centred: Point2[],
  pivot: Point2,
  radians: number,
  start: [number, number],
  range: number,
  step: number,
): { dx: number; dz: number; cost: number } {
  let best = { dx: start[0], dz: start[1], cost: Infinity }
  for (let ox = -range; ox <= range + 1e-9; ox += step) {
    for (let oz = -range; oz <= range + 1e-9; oz += step) {
      const dx = start[0] + ox
      const dz = start[1] + oz
      const cost = score(field, centred, pivot, radians, dx, dz)
      if (cost < best.cost) best = { dx, dz, cost }
    }
  }
  return best
}

export interface AlignmentResult extends StoreyAlignment {
  /** Mean distance (m) from the storey's outline to the one below after aligning. */
  cost: number
}

/**
 * Lines up one storey's outline with the storey below. Upper floors mostly sit on the walls of
 * the floor below, so the best fit puts as much of the upper outline as possible on the lower
 * one. Tries each right-angle turn (separately scanned storeys can face any way), then refines.
 */
export function alignStorey(upper: Point2[][], lower: Point2[][]): AlignmentResult {
  const pivot = pivotOf({ closed: upper } as StoreyOutline)
  const centred = sampleOutlines(upper, 0.1).map(([x, z]): Point2 => [x - pivot[0], z - pivot[1]])
  const field = new DistanceField(lower, 6)
  const lowerPivot = pivotOf({ closed: lower } as StoreyOutline)
  const startShift: [number, number] = [lowerPivot[0] - pivot[0], lowerPivot[1] - pivot[1]]

  // Candidate rotations: whatever squares the upper storey with the lower one, plus quarter turns.
  const difference = dominantAngle(upper) - dominantAngle(lower)
  const candidates = [-1, 1].flatMap((sign) => [0, 1, 2, 3].map((k) => sign * difference + (k * Math.PI) / 2))

  let best = { radians: 0, dx: 0, dz: 0, cost: Infinity }
  for (const radians of candidates) {
    const coarse = searchShift(field, centred, pivot, radians, startShift, 5, 0.2)
    if (coarse.cost < best.cost) best = { radians, ...coarse }
  }

  // Refine: small rotations around the best, each with a finer shift search.
  for (const delta of [0.4, 0.1, 0.02]) {
    let improved = best
    for (let k = -4; k <= 4; k++) {
      const radians = best.radians + (k * delta * Math.PI) / 180
      const fine = searchShift(field, centred, pivot, radians, [best.dx, best.dz], delta * 2, Math.max(0.01, delta / 4))
      if (fine.cost < improved.cost) improved = { radians, ...fine }
    }
    best = improved
  }

  let degrees = (best.radians * 180) / Math.PI
  degrees = ((degrees + 540) % 360) - 180
  return { rotation: degrees, dx: best.dx, dz: best.dz, cost: best.cost }
}

/** Aligns every storey above the lowest with the (already aligned) storey below it. */
export function autoAlign(scan: Scan): Record<number, StoreyAlignment> {
  const result: Record<number, StoreyAlignment> = {}
  const ordered = [...scan.outlines].sort((a, b) => a.story - b.story).filter((o) => o.closed.length)
  if (!ordered.length) return result
  result[ordered[0].story] = IDENTITY

  let below = ordered[0].closed
  for (const outline of ordered.slice(1)) {
    const { rotation, dx, dz } = alignStorey(outline.closed, below)
    const alignment = { rotation, dx, dz }
    result[outline.story] = alignment
    below = outline.closed.map((o) => applyAlignment(o, pivotOf(outline), alignment))
  }
  return result
}
