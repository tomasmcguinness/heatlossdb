import { describe, expect, it } from 'vitest'
import type { Point2 } from '../../scan/outline'
import { CAVITY, CAVITY_WALL, cavityWallShapes, cornersOf, gapOffset, LEAF, outwardOf, splitPiece, type CavityLine } from './wallShapes'

/** The corners of an "M x,z L x,z … Z" path. */
const corners = (d: string): Point2[] => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
const range = (d: string, axis: 0 | 1) => {
  const values = corners(d).map((p) => p[axis])
  return [Math.min(...values), Math.max(...values)]
}

// A wall along x from 0 to 4 at z = 0. With its room on the left of a→b (the normal (0, 1)), the
// room is at z > 0 and the wall is built out towards z < 0.
const wall: CavityLine = { a: [0, 0], b: [4, 0], inside: 1 }
const piece = { a: [0, 0] as Point2, b: [4, 0] as Point2, end: [true, true] as [boolean, boolean] }

describe('Cavity wall shapes', () => {
  it('build the wall outward from the room’s face, with the cavity between the leaves', () => {
    const { wall: band, cavity } = cavityWallShapes(piece, outwardOf(wall), [null, null])
    expect(range(band, 1)).toEqual([-CAVITY_WALL, 0])
    const [lo, hi] = range(cavity, 1)
    expect(lo).toBeCloseTo(-(LEAF + CAVITY), 6)
    expect(hi).toBeCloseTo(-LEAF, 6)
    expect(range(band, 0)).toEqual([0, 4])
  })

  it('flip with the side the room is on', () => {
    const { wall: band } = cavityWallShapes(piece, outwardOf({ ...wall, inside: -1 }), [null, null])
    expect(range(band, 1)).toEqual([0, CAVITY_WALL])
  })

  it('carry on round an outer corner, and stop short at an inner one', () => {
    const out = outwardOf(wall)
    const outer = cavityWallShapes(piece, out, ['outer', null])
    expect(range(outer.wall, 0)[0]).toBeCloseTo(-CAVITY_WALL, 6)
    expect(range(outer.cavity, 0)[0]).toBeCloseTo(-(LEAF + CAVITY), 6)
    const inner = cavityWallShapes(piece, out, ['inner', null])
    expect(range(inner.wall, 0)[0]).toBeCloseTo(0, 6)
    expect(range(inner.cavity, 0)[0]).toBeCloseTo(LEAF, 6)
  })

  it('stop square at the side of a door or window', () => {
    const gapSide = { ...piece, end: [false, false] as [boolean, boolean] }
    const { wall: band, cavity } = cavityWallShapes(gapSide, outwardOf(wall), ['outer', 'outer'])
    expect(range(band, 0)).toEqual([0, 4])
    expect(range(cavity, 0)).toEqual([0, 4])
  })
})

describe('Corners between cavity walls', () => {
  // A 4 m × 3 m room at z > 0, x > 0, walled on two sides: the wall along x and one up the west side.
  const west: CavityLine = { a: [0, 3], b: [0, 0], inside: 1 }

  it('are outer where the next wall turns back into the house', () => {
    expect(cornersOf([wall, west])).toEqual([
      ['outer', null],
      [null, 'outer'],
    ])
  })

  it('are inner where the next wall turns away from it, as in an L-shaped house', () => {
    // A wall continuing outward (down, z < 0) from the same corner, with its room to the west.
    const outwardTurn: CavityLine = { a: [0, 0], b: [0, -3], inside: -1 }
    expect(cornersOf([wall, outwardTurn])[0][0]).toBe('inner')
  })

  it('are neither where nothing meets the end', () => {
    expect(cornersOf([wall])).toEqual([[null, null]])
  })
})

describe('Splitting a wall where its cavity stretches start and end', () => {
  const line = { a: [0, 0] as Point2, b: [10, 0] as Point2 }

  it('keeps the piece’s own ends and stops square at the stretch’s', () => {
    const whole = { a: [0, 0] as Point2, b: [10, 0] as Point2, end: [true, true] as [boolean, boolean] }
    const stretch = { t0: 0.5, t1: 1 }
    const parts = splitPiece(whole, line, [stretch])
    expect(parts.map((p) => [p.piece.a[0], p.piece.b[0], p.piece.end, p.stretch])).toEqual([
      [0, 5, [true, false], null],
      [5, 10, [false, true], stretch],
    ])
  })

  it('cuts a piece between a window and the wall’s end only where a stretch ends inside it', () => {
    // From a window gap at x = 2 to the wall's end, with a stretch over the middle.
    const piece = { a: [2, 0] as Point2, b: [10, 0] as Point2, end: [false, true] as [boolean, boolean] }
    const stretch = { t0: 0.4, t1: 0.6 }
    expect(splitPiece(piece, line, [stretch]).map((p) => [p.piece.a[0], p.piece.b[0], p.stretch !== null])).toEqual([
      [2, 4, false],
      [4, 6, true],
      [6, 10, false],
    ])
    expect(splitPiece(piece, line, [])).toHaveLength(1)
  })
})

describe('Doors and windows in a cavity wall', () => {
  it('sit across the middle of the wall', () => {
    const [x, z] = gapOffset({ a: [1, 0], b: [2, 0] }, [wall])
    expect(x).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(-CAVITY_WALL / 2, 6)
  })

  it('stay where they are in any other wall', () => {
    expect(gapOffset({ a: [1, 2], b: [2, 2] }, [wall])).toEqual([0, 0])
    expect(gapOffset({ a: [0.5, 1], b: [0.5, 2] }, [wall])).toEqual([0, 0])
  })
})
