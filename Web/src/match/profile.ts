import { applyAlignment, IDENTITY, pivotOf, type StoreyAlignment } from '../scan/align'
import type { Role } from '../scan/classify'
import { areaOf, polygonArea } from '../scan/geometry'
import type { Point2 } from '../scan/outline'
import type { Scan } from '../scan/types'

/**
 * What matching needs to know about a home's shape, derived from its scan. Small enough to
 * store and send for every home (a few KB), unlike the scan itself.
 */
export interface ShapeProfile {
  version: 1
  /** The scan's fingerprint (Scan.hash), the same however it's opened, edited or uploaded, so
   *  a home is never matched against itself. Missing from profiles saved before it was added. */
  scanHash?: string
  /** Heated floor area across all storeys (m²), including built-in storage. */
  floorArea: number
  storeys: number
  /** Areas of the envelope (m²), from the walls' roles: the guess plus the user's corrections. */
  externalWallArea: number
  partyWallArea: number
  windowArea: number
  /** Each storey's outline, lined up with the others and centred on the ground floor, lowest
   *  storey first. */
  plans: Point2[][][]
}

export function computeProfile(
  scan: Scan,
  roleOf: (id: string) => Role,
  alignment: Record<number, StoreyAlignment>,
): ShapeProfile {
  const outlines = [...scan.outlines].sort((a, b) => a.story - b.story).filter((o) => o.closed.length)
  const aligned = outlines.map((o) =>
    o.closed.map((outline) => applyAlignment(outline, pivotOf(o), alignment[o.story] ?? IDENTITY)),
  )
  const [cx, cz] = aligned.length ? pivotOf({ closed: aligned[0] } as never) : [0, 0]
  const plans = aligned.map((storey) =>
    storey.map((outline) => outline.map(([x, z]): Point2 => [round(x - cx), round(z - cz)])),
  )

  const sum = (kind: string, role: Role) =>
    scan.elements.filter((e) => e.kind === kind && roleOf(e.id) === role).reduce((total, e) => total + areaOf(e), 0)

  return {
    version: 1,
    scanHash: scan.hash,
    floorArea: round(aligned.flat().reduce((total, outline) => total + polygonArea(outline), 0)),
    storeys: aligned.length,
    externalWallArea: round(sum('wall', 'external')),
    partyWallArea: round(sum('wall', 'party')),
    windowArea: round(sum('window', 'external')),
    plans,
  }
}

/** Centimetre precision is plenty and keeps profiles small. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function isShapeProfile(value: unknown): value is ShapeProfile {
  const p = value as ShapeProfile
  return typeof p === 'object' && p !== null && p.version === 1 && Array.isArray(p.plans) && typeof p.floorArea === 'number'
}
