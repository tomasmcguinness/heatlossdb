import ClipperLib from 'clipper-lib'

export type Point2 = [number, number]

/** Clipper works in integers; scale metres to millimetres. */
const SCALE = 1000

/**
 * Notches narrower than twice this (m) are closed. RoomPlan can't see into built-in wardrobes,
 * so it traces the room around them and the outline gets a notch where the wardrobe is.
 */
export const NOTCH_RADIUS = 0.45

function offset(paths: ClipperLib.Paths, delta: number): ClipperLib.Paths {
  const clipper = new ClipperLib.ClipperOffset(8, 0.01 * SCALE)
  clipper.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const result: ClipperLib.Paths = []
  clipper.Execute(result, delta * SCALE)
  return result
}

/**
 * The outline with narrow notches filled: grow it by `radius`, then shrink it back. Square
 * corners survive (mitred joins) while gaps narrower than 2 × radius disappear.
 */
export function closeOutline(points: Point2[], radius = NOTCH_RADIUS): Point2[] {
  if (points.length < 3) return points
  const path = points.map(([x, z]) => ({ X: Math.round(x * SCALE), Y: Math.round(z * SCALE) }))
  const closed = offset(offset([path], radius), -radius)
  if (!closed.length) return points
  const largest = closed.reduce((a, b) => (Math.abs(ClipperLib.Clipper.Area(b)) > Math.abs(ClipperLib.Clipper.Area(a)) ? b : a))
  const cleaned = ClipperLib.Clipper.CleanPolygon(largest, 0.01 * SCALE)
  return cleaned.map((p) => [p.X / SCALE, p.Y / SCALE])
}

export function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}

/** Distance from p to the segment, or Infinity if p lies beyond either end of it. */
export function distanceBesideSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const lengthSq = dx * dx + dz * dz
  if (!lengthSq) return Infinity
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq
  if (t < 0 || t > 1) return Infinity
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}

export function edgesOf(outline: Point2[]): [Point2, Point2][] {
  return outline.map((p, i) => [p, outline[(i + 1) % outline.length]])
}

export interface PolygonWithHoles {
  outer: Point2[]
  holes: Point2[][]
}

const toPath = (points: Point2[]): ClipperLib.Path =>
  points.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))
const fromPath = (path: ClipperLib.Path): Point2[] => path.map((p) => [p.X / SCALE, p.Y / SCALE])

/**
 * The polygon with the cut-outs removed. A cut-out that reaches the edge (an archway down to
 * the floor) becomes a notch in the outline rather than a hole, which is why this uses a proper
 * boolean difference instead of adding holes to a shape.
 */
export function subtract(polygon: Point2[], cutouts: Point2[][]): PolygonWithHoles[] {
  if (!cutouts.length) return [{ outer: polygon, holes: [] }]
  const clipper = new ClipperLib.Clipper()
  clipper.AddPath(toPath(polygon), ClipperLib.PolyType.ptSubject, true)
  clipper.AddPaths(cutouts.map(toPath), ClipperLib.PolyType.ptClip, true)
  const tree = new ClipperLib.PolyTree()
  clipper.Execute(
    ClipperLib.ClipType.ctDifference,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  )
  return ClipperLib.JS.PolyTreeToExPolygons(tree).map((ex) => ({
    outer: fromPath(ex.outer),
    holes: ex.holes.map(fromPath),
  }))
}

function booleanArea(subject: Point2[][], clip: Point2[][], type: ClipperLib.ClipType): number {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subject.map(toPath), ClipperLib.PolyType.ptSubject, true)
  clipper.AddPaths(clip.map(toPath), ClipperLib.PolyType.ptClip, true)
  const result: ClipperLib.Paths = []
  clipper.Execute(type, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  // Holes come back with the opposite winding, so summing signed areas subtracts them.
  return Math.abs(result.reduce((sum, path) => sum + ClipperLib.Clipper.Area(path), 0)) / (SCALE * SCALE)
}

/** How much two plans overlap: intersection over union, from 0 (none) to 1 (identical). */
export function overlap(a: Point2[][], b: Point2[][]): number {
  if (!a.length || !b.length) return 0
  const union = booleanArea(a, b, ClipperLib.ClipType.ctUnion)
  return union > 0 ? booleanArea(a, b, ClipperLib.ClipType.ctIntersection) / union : 0
}
