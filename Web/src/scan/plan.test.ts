import { describe, expect, it } from 'vitest'
import { floorPlans, measureRooms } from './plan'
import { parseScan } from './parse'
import type { Point2 } from './outline'
import type { RawSurface } from './types'

const square: Point2[] = [
  [0, 0],
  [8, 0],
  [8, 4],
  [0, 4],
]

describe('measureRooms', () => {
  it('splits a storey into rooms along its walls', () => {
    // An 8 m × 4 m floor with a wall at x = 3.
    const [left, right] = measureRooms([square], [[[3, 0], [3, 4]]], [[1, 2], [6, 2]])
    expect(left).toBeCloseTo(12, 0)
    expect(right).toBeCloseTo(20, 0)
  })

  it('splits open plan rooms halfway between their labels', () => {
    const [a, b] = measureRooms([square], [], [[2, 2], [6, 2]])
    expect(a).toBeCloseTo(16, 0)
    expect(b).toBeCloseTo(16, 0)
  })

  it('has no area for a label outside the floor', () => {
    expect(measureRooms([square], [], [[20, 20]])).toEqual([null])
  })
})

describe('floorPlans', () => {
  const at = (x: number, z: number, turn = false) =>
    turn ? [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, x, 1.2, z, 1] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 1.2, z, 1]
  const wall = (identifier: string, length: number, transform: number[]): RawSurface => ({
    identifier,
    category: { wall: {} },
    dimensions: [length, 2.4, 0],
    transform,
    parentIdentifier: null,
    story: 0,
  })

  it('names and numbers rooms, and measures each one', () => {
    const scan = parseScan({
      walls: [
        wall('n', 8, at(4, 0)),
        wall('s', 8, at(4, 4)),
        wall('w', 4, at(0, 2, true)),
        wall('e', 4, at(8, 2, true)),
        wall('middle', 4, at(4, 2, true)),
      ],
      doors: [],
      windows: [],
      openings: [],
      floors: [
        {
          identifier: 'f',
          category: { floor: {} },
          dimensions: [8, 4, 0],
          // Lies flat: local y runs along world −z.
          transform: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 4, 0, 2, 1],
          parentIdentifier: null,
          story: 0,
          polygonCorners: [
            [-4, -2, 0],
            [4, -2, 0],
            [4, 2, 0],
            [-4, 2, 0],
          ],
        },
      ],
      sections: [
        { label: 'bedroom', center: [2, 0, 2], story: 0 },
        { label: 'bedroom', center: [6, 0, 2], story: 0 },
      ],
    })
    const [plan] = floorPlans(scan)
    expect(plan.rooms.map((r) => r.name)).toEqual(['Bedroom 1', 'Bedroom 2'])
    // Measured inside the walls, so a little under 4 m × 4 m.
    for (const room of plan.rooms) expect(room.area).toBeGreaterThan(14.5)
    for (const room of plan.rooms) expect(room.area).toBeLessThan(16)
    expect(plan.area).toBeCloseTo(32, 0)
  })
})
