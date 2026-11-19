import type { Point2 } from '../../scan/outline'
import type { WallPiece } from '../../scan/plan'

/** Wall thicknesses (m) the plan draws. RoomPlan reports walls as flat planes, so these are nominal. */
export const INTERNAL_WALL = 0.06
export const EXTERNAL_WALL = 0.12

/** A cavity wall, drawn outward from the room's side of the scanned line (its inside face): a brick
 *  inner leaf, the cavity, and a brick outer leaf. */
export const LEAF = 0.1
export const CAVITY = 0.07
export const CAVITY_WALL = 2 * LEAF + CAVITY

const unit = (a: Point2, b: Point2): Point2 => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  return length ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : [0, 0]
}

const path = (corners: Point2[]) => `M${corners.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join('L')}Z`

/** A piece of wall as a rectangle `thickness` wide, carried on by half that at the wall's own ends. */
export function pieceShape({ a, b, end }: WallPiece, thickness: number): string {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (!length) return ''
  const half = thickness / 2
  const [dx, dz] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
  const [nx, nz] = [-dz * half, dx * half]
  const start: Point2 = end[0] ? [a[0] - dx * half, a[1] - dz * half] : a
  const finish: Point2 = end[1] ? [b[0] + dx * half, b[1] + dz * half] : b
  return path([
    [start[0] + nx, start[1] + nz],
    [finish[0] + nx, finish[1] + nz],
    [finish[0] - nx, finish[1] - nz],
    [start[0] - nx, start[1] - nz],
  ])
}

/** A cavity wall's line, and which side of it (the left of a→b is +1) its room is on. */
export interface CavityLine {
  a: Point2
  b: Point2
  inside: 1 | -1
}

/** The unit direction away from the room: the opposite of the side `inside` names. */
export function outwardOf({ a, b, inside }: CavityLine): Point2 {
  const [dx, dz] = unit(a, b)
  return [dz * inside, -dx * inside]
}

/**
 * What each end of a cavity wall meets: another cavity wall turning back into the house (an outer
 * corner, where both carry on past the corner to close it), one turning away from it (an inner
 * corner, where they meet without carrying on), or neither. Ends within `reach` count as meeting.
 */
export type Corner = 'outer' | 'inner' | null

export function cornersOf(walls: CavityLine[], reach = 0.3): [Corner, Corner][] {
  return walls.map((wall) => {
    const out = outwardOf(wall)
    const at = (point: Point2): Corner => {
      for (const other of walls) {
        if (other === wall) continue
        for (const [near, far] of [
          [other.a, other.b],
          [other.b, other.a],
        ] as const) {
          if (Math.hypot(near[0] - point[0], near[1] - point[1]) > reach) continue
          const [gx, gz] = unit(near, far)
          const turn = gx * out[0] + gz * out[1]
          if (turn < -0.5) return 'outer'
          if (turn > 0.5) return 'inner'
        }
      }
      return null
    }
    return [at(wall.a), at(wall.b)]
  })
}

/** A band `from`–`to` metres outward of a→b, carried on (or cut back, if negative) by `extend` at each end. */
function band(a: Point2, b: Point2, out: Point2, from: number, to: number, extend: [number, number]): string {
  const [dx, dz] = unit(a, b)
  if (!dx && !dz) return ''
  const start: Point2 = [a[0] - dx * extend[0], a[1] - dz * extend[0]]
  const finish: Point2 = [b[0] + dx * extend[1], b[1] + dz * extend[1]]
  const off = (p: Point2, d: number): Point2 => [p[0] + out[0] * d, p[1] + out[1] * d]
  return path([off(start, from), off(finish, from), off(finish, to), off(start, to)])
}

/**
 * A piece of cavity wall: the whole wall band (both leaves and the cavity, drawn in the wall's
 * colour) and the cavity strip drawn over it. At an outer corner both carry on past the wall's end, so
 * the corner closes and the cavity turns it; at an inner corner the wall stops at the corner and the
 * cavity one leaf short of it, meeting the other wall's cavity. At the side of a door or window gap
 * they stop square.
 */
export function cavityWallShapes(piece: WallPiece, out: Point2, corners: [Corner, Corner]): { wall: string; cavity: string } {
  const wallExtend = (own: boolean, corner: Corner) => (own && corner === 'outer' ? CAVITY_WALL : 0)
  const cavityExtend = (own: boolean, corner: Corner) =>
    !own ? 0 : corner === 'outer' ? LEAF + CAVITY : corner === 'inner' ? -LEAF : 0
  return {
    wall: band(piece.a, piece.b, out, 0, CAVITY_WALL, [wallExtend(piece.end[0], corners[0]), wallExtend(piece.end[1], corners[1])]),
    cavity: band(piece.a, piece.b, out, LEAF, LEAF + CAVITY, [cavityExtend(piece.end[0], corners[0]), cavityExtend(piece.end[1], corners[1])]),
  }
}

/**
 * Splits a piece of a wall (a→b) where the given stretches of it (`t0`–`t1` of the way along the
 * wall) start and end. Each part says which stretch it's in, or null. A part keeps the piece's own
 * end where it has one; where a stretch starts or ends mid-piece, it stops square.
 */
export function splitPiece<T extends { t0: number; t1: number }>(
  piece: WallPiece,
  wall: { a: Point2; b: Point2 },
  stretches: T[],
): { piece: WallPiece; stretch: T | null }[] {
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
  if (!length) return [{ piece, stretch: null }]
  const tOf = (p: Point2) => ((p[0] - wall.a[0]) * (wall.b[0] - wall.a[0]) + (p[1] - wall.a[1]) * (wall.b[1] - wall.a[1])) / (length * length)
  const at = (t: number): Point2 => [wall.a[0] + t * (wall.b[0] - wall.a[0]), wall.a[1] + t * (wall.b[1] - wall.a[1])]
  const [p0, p1] = [tOf(piece.a), tOf(piece.b)]
  const cuts = [...new Set([p0, p1, ...stretches.flatMap((s) => [s.t0, s.t1]).filter((t) => t > p0 + 1e-6 && t < p1 - 1e-6)])].sort((x, y) => x - y)
  const parts: { piece: WallPiece; stretch: T | null }[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [t0, t1] = [cuts[i], cuts[i + 1]]
    if (t1 - t0 < 1e-6) continue
    const mid = (t0 + t1) / 2
    const stretch = stretches.find((s) => s.t0 <= mid && mid <= s.t1) ?? null
    parts.push({
      piece: { a: i === 0 ? piece.a : at(t0), b: i + 2 === cuts.length ? piece.b : at(t1), end: [i === 0 && piece.end[0], i + 2 === cuts.length && piece.end[1]] },
      stretch,
    })
  }
  return parts
}

/** How far to move a door or window's line so it sits across the middle of the cavity wall it's in:
 *  half the wall's thickness outward, or nothing if it isn't in one. A gap is in a wall when it runs
 *  along it, within `reach` of its line. */
export function gapOffset(gap: { a: Point2; b: Point2 }, walls: CavityLine[], reach = 0.15): Point2 {
  const mid: Point2 = [(gap.a[0] + gap.b[0]) / 2, (gap.a[1] + gap.b[1]) / 2]
  const along = unit(gap.a, gap.b)
  for (const wall of walls) {
    const d = unit(wall.a, wall.b)
    if (Math.abs(d[0] * along[0] + d[1] * along[1]) < 0.96) continue
    const t = (mid[0] - wall.a[0]) * d[0] + (mid[1] - wall.a[1]) * d[1]
    const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
    if (t < -reach || t > length + reach) continue
    const across = Math.abs((mid[0] - wall.a[0]) * -d[1] + (mid[1] - wall.a[1]) * d[0])
    if (across > reach) continue
    const out = outwardOf(wall)
    return [out[0] * (CAVITY_WALL / 2), out[1] * (CAVITY_WALL / 2)]
  }
  return [0, 0]
}
