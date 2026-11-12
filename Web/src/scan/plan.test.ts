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

  const twoRooms = ({ openings = [] as RawSurface[], sections = ['bedroom', 'bedroom'], windowAt = 2 } = {}) =>
    parseScan({
      walls: [
        wall('n', 8, at(4, 0)),
        wall('s', 8, at(4, 4)),
        wall('w', 4, at(0, 2, true)),
        wall('e', 4, at(8, 2, true)),
        wall('middle', 4, at(4, 2, true)),
      ],
      // A window in the north wall of the left room, and a door between the rooms.
      doors: [{ ...wall('inside-door', 0.9, at(4, 2, true)), category: { door: {} }, parentIdentifier: 'middle' }],
      windows: [{ ...wall('north-window', 1.2, at(windowAt, 0)), category: { window: {} }, parentIdentifier: 'n' }],
      openings,
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
      sections: sections.map((label, i) => ({ label, center: [2 + 4 * i, 0, 2], story: 0 })),
    })

  it('names and numbers rooms, and measures each one', () => {
    const [plan] = floorPlans(twoRooms())
    expect(plan.rooms.map((r) => r.name)).toEqual(['Bedroom 1', 'Bedroom 2'])
    // Measured inside the walls, so a little under 4 m × 4 m.
    for (const room of plan.rooms) expect(room.area).toBeGreaterThan(14.5)
    for (const room of plan.rooms) expect(room.area).toBeLessThan(16)
    expect(plan.area).toBeCloseTo(32, 0)
  })

  it('gives each external door and window to the room it opens from', () => {
    const [plan] = floorPlans(twoRooms(), undefined, (id) => id !== 'inside-door')
    const [left, right] = plan.rooms
    expect(left.elements.map((e) => e.id)).toEqual(['north-window'])
    expect(right.elements).toEqual([])
  })

  it('lists doors in internal walls only when told they are external', () => {
    const [plan] = floorPlans(twoRooms())
    expect(plan.rooms.flatMap((r) => r.elements.map((e) => e.id)).sort()).toEqual(['inside-door', 'north-window'])
  })

  it('keeps room ids stable', () => {
    const ids = (scan = twoRooms()) => floorPlans(scan)[0].rooms.map((r) => r.id)
    expect(ids()).toEqual(ids())
    expect(new Set(ids()).size).toBe(2)
  })

  it('draws each room as the cells it covers', () => {
    const [plan] = floorPlans(twoRooms())
    for (const room of plan.rooms) {
      // Each run is "M x z h width v height h -width z"; add up width × height.
      const area = [...room.shape.matchAll(/h([\d.]+)v([\d.]+)/g)].reduce((total, [, w, h]) => total + Number(w) * Number(h), 0)
      expect(area).toBeCloseTo(room.area!, 1)
    }
  })

  // The middle wall with an opening through it, and a label only in the left room, as for a bay
  // window RoomPlan closed off with a wall under its header.
  const opening = (width: number): RawSurface => ({ ...wall('gap', width, at(4, 2, true)), category: { opening: {} }, parentIdentifier: 'middle' })

  it('joins an unlabelled space to the room it opens off along its whole width', () => {
    // The window is in the unlabelled right-hand room.
    const [plan] = floorPlans(twoRooms({ openings: [opening(4)], sections: ['bedroom'], windowAt: 6 }), undefined, (id) => id !== 'inside-door')
    const [room] = plan.rooms
    expect(room.area).toBeGreaterThan(30)
    expect(room.elements.map((e) => e.id)).toEqual(['north-window'])
  })

  it('keeps a wall with a narrower opening between rooms', () => {
    const [plan] = floorPlans(twoRooms({ openings: [opening(1)], sections: ['bedroom'] }))
    expect(plan.rooms[0].area).toBeLessThan(16)
  })
})
