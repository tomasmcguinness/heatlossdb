import { wallPointAt } from './geometry'
import { distanceToSegment, edgesOf, type Point2 } from './outline'
import { indexScan } from './parse'
import type { Scan, ScanElement } from './types'

export type Role = 'external' | 'party' | 'internal'

/** How far (m) a wall may sit from its storey's floor outline and still count as on it. */
export const OUTLINE_TOLERANCE = 0.3

/** Points along each wall to test. A wall is external when most of them lie on the outline:
 *  checking only the ends would wrongly mark an internal wall that runs between two external
 *  walls, while requiring all of them misses walls that run on past an outside corner. */
const SAMPLES = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]
const MAJORITY = 0.5

function distanceToOutlines(p: Point2, outlines: Point2[][]): number {
  let best = Infinity
  for (const outline of outlines) {
    for (const [a, b] of edgesOf(outline)) best = Math.min(best, distanceToSegment(p, a, b))
  }
  return best
}

function isOnOutline(wall: ScanElement, outlines: Point2[][]): boolean {
  if (!outlines.length) return false
  const on = SAMPLES.filter((t) => {
    const point = wallPointAt(wall, t)
    return distanceToOutlines([point.x, point.z], outlines) <= OUTLINE_TOLERANCE
  })
  return on.length / SAMPLES.length > MAJORITY
}

/**
 * Guesses each element's role from the geometry alone. RoomPlan doesn't say which walls are
 * external, but the floor outline of each storey traces the inside face of its external walls:
 * walls lying along it are external, the rest internal. The outline used has narrow notches
 * closed, so the sides of a built-in wardrobe RoomPlan traced around count as internal. The user
 * corrects the guess (and marks party walls) in the viewer.
 */
export function classify(scan: Scan): Record<string, Role> {
  const { byId } = indexScan(scan)
  const outlinesByStorey = new Map(scan.outlines.map((o) => [o.story, o.closed]))

  const lowest = scan.stories[0]
  const highest = scan.stories[scan.stories.length - 1]
  const roles: Record<string, Role> = {}

  for (const e of scan.elements) {
    switch (e.kind) {
      case 'wall':
        roles[e.id] = isOnOutline(e, outlinesByStorey.get(e.story) ?? []) ? 'external' : 'internal'
        break
      case 'floor':
        roles[e.id] = e.story === lowest ? 'external' : 'internal'
        break
      case 'ceiling':
        roles[e.id] = e.story === highest ? 'external' : 'internal'
        break
    }
  }

  // Windows are almost always in external walls, so a wall holding one is external even if it
  // strays from the floor outline (e.g. a bay that RoomPlan's floor polygon cuts across).
  for (const e of scan.elements) {
    if (e.kind === 'window' && e.parentId && roles[e.parentId] === 'internal') {
      roles[e.parentId] = 'external'
    }
  }

  // Doors, windows and openings take their wall's role.
  for (const e of scan.elements) {
    if (e.kind === 'door' || e.kind === 'window' || e.kind === 'opening') {
      const parent = e.parentId ? byId.get(e.parentId) : undefined
      roles[e.id] = parent ? (roles[parent.id] ?? 'internal') : 'internal'
    }
  }

  return roles
}
