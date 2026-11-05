import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { classify } from './classify'
import { matrixOf } from './geometry'
import { indexScan, parseScan, ScanParseError } from './parse'
import type { RawSurface } from './types'

// Real scans live in the gitignored fixtures/ folder; these tests skip when it's empty.
const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))
const load = (name: string) => parseScan(JSON.parse(readFileSync(fixture(name), 'utf8')))

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const at = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

function surface(identifier: string, category: string, extra: Partial<RawSurface> = {}): RawSurface {
  return {
    identifier,
    category: { [category]: {} },
    dimensions: [1, 1, 0],
    transform: identity,
    parentIdentifier: null,
    story: 0,
    polygonCorners: [],
    ...extra,
  }
}

describe('parseScan', () => {
  it('rejects files that are not RoomPlan structures', () => {
    expect(() => parseScan({ hello: 'world' })).toThrow(ScanParseError)
    expect(() => parseScan({ walls: [] })).toThrow(ScanParseError)
  })

  it('reads categories, door state and parents, and adds a ceiling per floor', () => {
    const scan = parseScan({
      walls: [surface('w', 'wall', { dimensions: [4, 2.5, 0] })],
      doors: [{ ...surface('d', 'door', { parentIdentifier: 'w' }), category: { door: { isOpen: true } } }],
      windows: [],
      openings: [],
      floors: [
        surface('f', 'floor', {
          dimensions: [4, 3, 0],
          polygonCorners: [
            [-2, -1.5, 0],
            [2, -1.5, 0],
            [2, 1.5, 0],
            [-2, 1.5, 0],
          ],
        }),
      ],
    })
    const { byId, childrenOf } = indexScan(scan)
    expect(byId.get('d')?.isOpen).toBe(true)
    expect(childrenOf.get('w')?.map((e) => e.id)).toEqual(['d'])
    const ceiling = byId.get('ceiling-f')!
    expect(ceiling.kind).toBe('ceiling')
    // The ceiling sits at the storey's wall height above the floor.
    expect(new Vector3().applyMatrix4(matrixOf(ceiling)).y).toBeCloseTo(2.5)
  })

  it('gives the same hash for the same scan', () => {
    const json = { walls: [surface('a', 'wall'), surface('b', 'wall')], doors: [], windows: [], openings: [] }
    expect(parseScan(json).hash).toBe(parseScan(structuredClone(json)).hash)
  })
})

describe('classify', () => {
  it('marks walls on the floor outline external and walls across the middle internal', () => {
    // A 4 m × 4 m floor, walls along its north and south edges, and one wall across the middle
    // whose ends touch both of them.
    const floor = surface('f', 'floor', {
      dimensions: [4, 4, 0],
      // Floors are rotated so their local XY plane lies flat; this maps local y to world -z.
      transform: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
      polygonCorners: [
        [-2, -2, 0],
        [2, -2, 0],
        [2, 2, 0],
        [-2, 2, 0],
      ],
    })
    const north = surface('north', 'wall', { dimensions: [4, 2.4, 0], transform: at(0, 1.2, -2) })
    const south = surface('south', 'wall', { dimensions: [4, 2.4, 0], transform: at(0, 1.2, 2) })
    // Rotated 90° about Y so it runs north–south through the centre.
    const middle = surface('middle', 'wall', {
      dimensions: [4, 2.4, 0],
      transform: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1.2, 0, 1],
    })
    const window = surface('win', 'window', { parentIdentifier: 'north', transform: at(0, 1.2, -2) })

    const roles = classify(
      parseScan({ walls: [north, south, middle], doors: [], windows: [window], openings: [], floors: [floor] }),
    )
    expect(roles.north).toBe('external')
    expect(roles.south).toBe('external')
    expect(roles.middle).toBe('internal')
    expect(roles.win).toBe('external')
    expect(roles.f).toBe('external')
    expect(roles['ceiling-f']).toBe('external')
  })
})

describe.skipIf(!existsSync(fixture('MergedRooms_8.json')))('real two-storey scan', () => {
  const scan = load('MergedRooms_8.json')
  const { byId } = indexScan(scan)

  it('parses every element', () => {
    const count = (kind: string) => scan.elements.filter((e) => e.kind === kind).length
    expect(scan.stories).toEqual([0, 1])
    const scanned = scan.elements.filter((e) => !e.synthetic)
    const countScanned = (kind: string) => scanned.filter((e) => e.kind === kind).length
    expect([countScanned('wall'), count('door'), count('window'), count('opening'), count('floor')]).toEqual([
      54, 15, 13, 5, 2,
    ])
    expect(count('storage')).toBe(29)
  })

  it('places doors and windows within their parent wall', () => {
    for (const e of scan.elements.filter((e) => e.parentId)) {
      const wall = byId.get(e.parentId!)!
      // The child's centre, expressed in the wall's local space, lies within the wall's face.
      const local = new Vector3().applyMatrix4(matrixOf(e)).applyMatrix4(matrixOf(wall).invert())
      expect(Math.abs(local.x)).toBeLessThanOrEqual(wall.width / 2 + 0.05)
      expect(Math.abs(local.y)).toBeLessThanOrEqual(wall.height / 2 + 0.05)
      expect(Math.abs(local.z)).toBeLessThan(0.3)
    }
  })

  it('finds external walls on both storeys', () => {
    const roles = classify(scan)
    const external = scan.elements.filter((e) => e.kind === 'wall' && roles[e.id] === 'external')
    expect(new Set(external.map((e) => e.story))).toEqual(new Set([0, 1]))
    expect(external.length).toBeGreaterThan(15)
    expect(external.length).toBeLessThan(40)
  })
})

describe.skipIf(!existsSync(fixture('MergedRooms_8.json')))('built-in storage and storey alignment', () => {
  const scan = load('MergedRooms_8.json')

  it('closes the gap at the end of the first-floor wardrobe with an external wall', () => {
    const roles = classify(scan)
    const added = scan.elements.filter((e) => e.synthetic && e.story === 1)
    expect(added).toHaveLength(1)
    expect(added[0].width).toBeGreaterThan(0.5)
    expect(added[0].width).toBeLessThan(1)
    expect(roles[added[0].id]).toBe('external')
  })

  it('lines the first floor up with the ground floor', async () => {
    const { autoAlign } = await import('./align')
    const alignment = autoAlign(scan)
    expect(alignment[0]).toEqual({ rotation: 0, dx: 0, dz: 0 })
    // The scan has the first floor about 4–5° and ~0.4 m out of line.
    expect(alignment[1].rotation).toBeGreaterThan(-7)
    expect(alignment[1].rotation).toBeLessThan(-3)
    expect(Math.hypot(alignment[1].dx, alignment[1].dz)).toBeLessThan(1)
  })
})

describe('closeOutline and alignStorey', () => {
  it('fills a narrow notch but keeps a wide one', async () => {
    const { closeOutline } = await import('./outline')
    const { polygonArea } = await import('./geometry')
    // A 4 × 4 m room with a 0.6 m wide, 2 m deep notch cut into its top edge.
    const notched: [number, number][] = [
      [0, 0], [1.7, 0], [1.7, 2], [2.3, 2], [2.3, 0], [4, 0], [4, 4], [0, 4],
    ]
    expect(polygonArea(closeOutline(notched))).toBeCloseTo(16, 1)
    // A 2 m wide recess is real architecture and stays.
    const recessed: [number, number][] = [
      [0, 0], [1, 0], [1, 1], [3, 1], [3, 0], [4, 0], [4, 4], [0, 4],
    ]
    expect(polygonArea(closeOutline(recessed))).toBeCloseTo(14, 1)
  })

  it('recovers a known rotation and shift', async () => {
    const { alignStorey, applyAlignment, pivotOf } = await import('./align')
    // An L-shaped storey, so its orientation is unambiguous.
    const lower: [number, number][] = [
      [0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8],
    ]
    const misplaced = applyAlignment(lower, pivotOf({ closed: [lower] } as never), { rotation: 6, dx: 0.5, dz: -0.3 })
    const result = alignStorey([misplaced], [lower])
    const fixed = applyAlignment(misplaced, pivotOf({ closed: [misplaced] } as never), result)
    fixed.forEach(([x, z], i) => {
      expect(x).toBeCloseTo(lower[i][0], 1)
      expect(z).toBeCloseTo(lower[i][1], 1)
    })
  })
})

describe('openings', () => {
  const wall: [number, number][] = [
    [-2, -1.2], [2, -1.2], [2, 1.2], [-2, 1.2],
  ]

  it('cut a hole when inside the wall, and a notch when they reach the floor', async () => {
    const { subtract } = await import('./outline')
    const { polygonArea } = await import('./geometry')
    const area = (pieces: { outer: [number, number][]; holes: [number, number][][] }[]) =>
      pieces.reduce((sum, p) => sum + polygonArea(p.outer) - p.holes.reduce((s, h) => s + polygonArea(h), 0), 0)

    const hatch = subtract(wall, [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]])
    expect(hatch).toHaveLength(1)
    expect(hatch[0].holes).toHaveLength(1)
    expect(area(hatch)).toBeCloseTo(9.6 - 1, 2)

    // An archway from the floor (and a little below it, as scans often are) up to 2 m.
    const arch = subtract(wall, [[[-0.4, -1.25], [0.4, -1.25], [0.4, 0.8], [-0.4, 0.8]]])
    expect(arch.every((p) => p.holes.length === 0)).toBe(true)
    expect(area(arch)).toBeCloseTo(9.6 - 0.8 * 2, 2)
  })
})
