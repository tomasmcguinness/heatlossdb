import { describe, expect, it } from 'vitest'
import { floorPlans, measureRooms } from './plan'
import { parseScan } from './parse'
import type { Point2 } from './outline'
import type { RawSurface } from './types'

const box = (x0: number, x1: number, z0 = 0, z1 = 4): Point2[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]
const square = box(0, 8)

describe('measureRooms', () => {
  it('gives each room the floor it scanned', () => {
    // An 8 m × 4 m floor with a wall at x = 3.
    const [left, right] = measureRooms([square], [[[3, 0], [3, 4]]], [box(0, 3), box(3, 8)])
    expect(left).toBeCloseTo(12, 0)
    expect(right).toBeCloseTo(20, 0)
  })

  it('gives floor two scans overlap to the smaller room', () => {
    // The first scan carried on through into the second room.
    const [big, small] = measureRooms([square], [], [box(0, 8), box(4, 8)])
    expect(big).toBeCloseTo(16, 0)
    expect(small).toBeCloseTo(16, 0)
  })

  it('gives the bits of an overlapping scan cut off from it to the room they join on to', () => {
    // A big scan with a smaller room scanned in its middle: the big room keeps one side; the
    // other side, cut off from it, goes to the small room next to it.
    const [big, small] = measureRooms([square], [], [box(0, 8), box(2, 5)])
    expect(big).toBeCloseTo(12, 0)
    expect(small).toBeCloseTo(20, 0)
  })

  it('has no area for a room outside the floor', () => {
    expect(measureRooms([square], [], [box(20, 24)])).toEqual([null])
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
  /** A floor from x0 to x1 (and z 0 to 4), lying flat: local y runs along world −z. */
  const floor = (identifier: string, x0: number, x1: number): RawSurface => ({
    identifier,
    category: { floor: {} },
    dimensions: [x1 - x0, 4, 0],
    transform: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, (x0 + x1) / 2, 0, 2, 1],
    parentIdentifier: null,
    story: 0,
    polygonCorners: [
      [-(x1 - x0) / 2, -2, 0],
      [(x1 - x0) / 2, -2, 0],
      [(x1 - x0) / 2, 2, 0],
      [-(x1 - x0) / 2, 2, 0],
    ],
  })

  const outerWalls = () => [wall('n', 8, at(4, 0)), wall('s', 8, at(4, 4)), wall('w', 4, at(0, 2, true)), wall('e', 4, at(8, 2, true))]

  /** An 8 m × 4 m storey with a wall down the middle and the rooms scanned as `rooms` (x spans).
   *  With `roomWalls`, each scanned room also has the outer walls as its own. */
  const home = ({ rooms = [[0, 4], [4, 8]] as [number, number][], middleWall = true, windowAt = 2, roomWalls = false } = {}) =>
    parseScan({
      walls: [...outerWalls(), ...(middleWall ? [wall('middle', 4, at(4, 2, true))] : [])],
      // A window in the north wall, and a door between the rooms.
      doors: middleWall ? [{ ...wall('inside-door', 0.9, at(4, 2, true)), category: { door: {} }, parentIdentifier: 'middle' }] : [],
      windows: [{ ...wall('north-window', 1.2, at(windowAt, 0)), category: { window: {} }, parentIdentifier: 'n' }],
      openings: [],
      // RoomPlan's merged floor for the storey.
      floors: [floor('f', 0, 8)],
      rooms: rooms.map(([x0, x1], i) => ({
        story: 0,
        floors: [floor(`room-floor-${i}`, x0, x1)],
        walls: roomWalls ? outerWalls() : [],
      })),
      // RoomPlan's guesses at what each area is for; ignored.
      sections: [
        { label: 'kitchen', center: [2, 0, 2], story: 0 },
        { label: 'diningRoom', center: [6, 0, 2], story: 0 },
      ],
    })

  it('has a room for each room scanned, numbered in reading order', () => {
    const [plan] = floorPlans(home())
    expect(plan.rooms.map((r) => r.name)).toEqual(['Room 1', 'Room 2'])
    // Measured inside the walls, so a little under 4 m × 4 m.
    for (const room of plan.rooms) expect(room.area).toBeGreaterThan(14.5)
    for (const room of plan.rooms) expect(room.area).toBeLessThan(16.5)
    expect(plan.area).toBeCloseTo(32, 0)
  })

  it('keeps an open-plan room scanned as one room whole, whatever RoomPlan thinks its parts are for', () => {
    const [plan] = floorPlans(home({ rooms: [[0, 8]], middleWall: false }))
    expect(plan.rooms).toHaveLength(1)
    expect(plan.rooms[0].area).toBeGreaterThan(30)
  })

  it('leaves out space no scanned room covers', () => {
    // RoomPlan's merged floor runs to x = 8, but only the left room was scanned.
    const [plan] = floorPlans(home({ rooms: [[0, 4]] }))
    expect(plan.area).toBeCloseTo(16, 0)
    expect(plan.rooms).toHaveLength(1)
  })

  it('cuts off floor a room carries on past its walls, as through patio doors', () => {
    // The scanned floor runs 2 m past the east wall.
    const [plan] = floorPlans(home({ rooms: [[0, 10]], middleWall: false, roomWalls: true }))
    expect(plan.area).toBeCloseTo(32, 0)
  })

  it('keeps a floor as scanned when its walls don’t enclose it', () => {
    // No walls of its own to go by.
    const [plan] = floorPlans(home({ rooms: [[0, 10]], middleWall: false }))
    expect(plan.area).toBeCloseTo(40, 0)
  })

  it('gives each external door and window to the room it opens from', () => {
    const [plan] = floorPlans(home(), undefined, (id) => id !== 'inside-door')
    const [left, right] = plan.rooms
    expect(left.elements.map((e) => e.id)).toEqual(['north-window'])
    expect(right.elements).toEqual([])
  })

  it('lists doors in internal walls only when told they are external', () => {
    const [plan] = floorPlans(home())
    expect(plan.rooms.flatMap((r) => r.elements.map((e) => e.id)).sort()).toEqual(['inside-door', 'north-window'])
  })

  it('keeps room ids stable', () => {
    const ids = (scan = home()) => floorPlans(scan)[0].rooms.map((r) => r.id)
    expect(ids()).toEqual(ids())
    expect(new Set(ids()).size).toBe(2)
  })

  it('draws each room as the cells it covers', () => {
    const [plan] = floorPlans(home())
    for (const room of plan.rooms) {
      // Each run is "M x z h width v height h -width z"; add up width × height.
      const area = [...room.shape.matchAll(/h([\d.]+)v([\d.]+)/g)].reduce((total, [, w, h]) => total + Number(w) * Number(h), 0)
      expect(area).toBeCloseTo(room.area!, 1)
    }
  })

  it('makes each storey one room when the scan has no rooms (an older file)', () => {
    const [plan] = floorPlans(home({ rooms: [] }))
    expect(plan.rooms.map((r) => r.name)).toEqual(['Room 1'])
    expect(plan.area).toBeCloseTo(32, 0)
  })
})
