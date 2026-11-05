import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Matrix4, Path, Shape, ShapeGeometry, Vector3 } from 'three'
import { subtract, type Point2 } from './outline'
import type { ScanElement } from './types'

/** Walls arrive with no thickness; give them some so they read as solid and are easy to click. */
export const MIN_WALL_DEPTH = 0.1
/** Doors and windows stand slightly proud of their wall on both sides so they win the click. */
const INSET_PROUD = 0.04

export function matrixOf(element: ScanElement): Matrix4 {
  return new Matrix4().fromArray(element.matrix)
}

/** The matrix to draw the element with. Floors and ceilings drawn from their world outline
 *  need none. */
export function meshMatrixOf(element: ScanElement): Matrix4 {
  return element.outline ? new Matrix4() : matrixOf(element)
}

/** The element's local outline: its polygon if it has one, otherwise its width × height rectangle. */
export function outlineOf(element: ScanElement): [number, number][] {
  if (element.polygon.length >= 3) return element.polygon
  const w = element.width / 2
  const h = element.height / 2
  return [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ]
}

export function polygonArea(points: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

/** Face area in m²: the outline for floors and ceilings (including built-in storage), the
 *  polygon for shaped walls, otherwise width × height. */
export function areaOf(element: ScanElement): number {
  if (element.outline) return polygonArea(element.outline)
  return element.polygon.length >= 3 ? polygonArea(element.polygon) : element.width * element.height
}

/** A world-space point along a wall's centre line, from one end (t = 0) to the other (t = 1). */
export function wallPointAt(element: ScanElement, t: number): Vector3 {
  const x = (t - 0.5) * element.width
  return new Vector3(x, 0, 0).applyMatrix4(matrixOf(element))
}

/** A floor or ceiling's outline in world space, projected onto the ground plane (x, z). */
export function worldOutlineXZ(element: ScanElement): [number, number][] {
  const m = matrixOf(element)
  return outlineOf(element).map(([x, y]) => {
    const p = new Vector3(x, y, 0).applyMatrix4(m)
    return [p.x, p.z]
  })
}

function shapeFrom(points: [number, number][], holes: [number, number][][] = []): Shape {
  const shape = new Shape()
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  for (const hole of holes) {
    const path = new Path()
    hole.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)))
    path.closePath()
    shape.holes.push(path)
  }
  return shape
}

/** Where an opening sits in its wall's face, as a rectangle in the wall's local x/y. */
function openingRect(wall: ScanElement, opening: ScanElement): Point2[] {
  const centre = new Vector3().applyMatrix4(matrixOf(opening)).applyMatrix4(matrixOf(wall).invert())
  const w = opening.width / 2
  const h = opening.height / 2
  return [
    [centre.x - w, centre.y - h],
    [centre.x + w, centre.y - h],
    [centre.x + w, centre.y + h],
    [centre.x - w, centre.y + h],
  ]
}

/** A wall with its openings cut out as real holes, extruded to the wall's thickness. */
function wallGeometry(wall: ScanElement, openings: ScanElement[]): BufferGeometry {
  const depth = Math.max(wall.depth, MIN_WALL_DEPTH)
  if (!openings.length && wall.polygon.length < 3) return new BoxGeometry(wall.width, wall.height, depth)
  const pieces = subtract(
    outlineOf(wall),
    openings.map((o) => openingRect(wall, o)),
  )
  const geometry = new ExtrudeGeometry(
    pieces.map((p) => shapeFrom(p.outer, p.holes)),
    { depth, bevelEnabled: false },
  )
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

/** Builds the element's geometry in its local space; the mesh applies the element's matrix.
 *  A wall's `openings` are cut out of it. */
export function geometryFor(element: ScanElement, parent?: ScanElement, openings: ScanElement[] = []): BufferGeometry {
  switch (element.kind) {
    case 'floor':
    case 'ceiling': {
      if (element.outline) {
        // The shape's (x, y) become world (x, z) once rotated flat.
        const geometry = new ShapeGeometry(shapeFrom(element.outline))
        geometry.rotateX(Math.PI / 2)
        geometry.translate(0, element.elevation ?? 0, 0)
        return geometry
      }
      return new ShapeGeometry(shapeFrom(outlineOf(element)))
    }
    case 'storage':
      return new BoxGeometry(element.width, element.height, element.depth)
    case 'wall':
      return wallGeometry(element, openings)
    default: {
      const wallDepth = Math.max(parent?.depth ?? 0, MIN_WALL_DEPTH)
      const depth = Math.max(element.depth, wallDepth) + INSET_PROUD
      return new BoxGeometry(element.width, element.height, depth)
    }
  }
}
