import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { autoAlign } from '../scan/align'
import { classify } from '../scan/classify'
import { parseScan } from '../scan/parse'
import type { Point2 } from '../scan/outline'
import { computeProfile, isShapeProfile, type ShapeProfile } from './profile'
import { compare, placePlans, summarise } from './similarity'

// An L-shaped two-storey home: the first floor covers the long arm only.
const ground: Point2[] = [
  [0, 0], [9, 0], [9, 4], [4, 4], [4, 8], [0, 8],
]
const first: Point2[] = [
  [0, 0], [9, 0], [9, 4], [0, 4],
]
const home = (scale = 1, plans: Point2[][][] = [[ground], [first]]): ShapeProfile => ({
  version: 1,
  floorArea: (56 + 36) * scale * scale,
  storeys: plans.length,
  externalWallArea: 120 * scale * scale,
  partyWallArea: 0,
  windowArea: 14 * scale * scale,
  plans: plans.map((storey) => storey.map((o) => o.map(([x, z]): Point2 => [x * scale, z * scale]))),
})

describe('compare', () => {
  it('scores an identical home at (very nearly) 100', () => {
    const match = compare(home(), home())
    expect(match.score).toBeGreaterThanOrEqual(98)
    expect(match.placement.mirrored).toBe(false)
  })

  it('recognises a mirror image (like the other half of a semi)', () => {
    const mirrored = home(1, [[ground.map(([x, z]): Point2 => [-x, z])], [first.map(([x, z]): Point2 => [-x, z])]])
    const match = compare(home(), mirrored)
    expect(match.placement.mirrored).toBe(true)
    expect(match.factors.find((f) => f.key === 'layout')!.similarity).toBeGreaterThan(0.95)
  })

  it('recognises a turned and shifted copy', () => {
    const turned = home(1, [[ground.map(([x, z]): Point2 => [-z + 3, x - 1])], [first.map(([x, z]): Point2 => [-z + 3, x - 1])]])
    expect(compare(home(), turned).score).toBeGreaterThanOrEqual(97)
  })

  it('scores a bigger home lower, and says why', () => {
    const bigger = compare(home(), home(1.4))
    expect(bigger.score).toBeLessThan(85)
    expect(bigger.factors.find((f) => f.key === 'size')!.similarity).toBeLessThan(0.5)
    expect(summarise(bigger)).toMatch(/floor area differs/i)
  })

  it('places their plan over yours using the match', () => {
    const turned = home(1, [[ground.map(([x, z]): Point2 => [-z + 3, x - 1])], [first.map(([x, z]): Point2 => [-z + 3, x - 1])]])
    const placed = placePlans(turned.plans, compare(home(), turned).placement)
    // Every corner of their placed ground floor lands on one of yours.
    for (const [x, z] of placed[0][0]) {
      expect(Math.min(...ground.map(([gx, gz]) => Math.hypot(gx - x, gz - z)))).toBeLessThan(0.1)
    }
  })
})

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))

describe.skipIf(!existsSync(fixture('MergedRooms_8.json')))('profiles from real scans', () => {
  const profileOf = (name: string) => {
    const scan = parseScan(JSON.parse(readFileSync(fixture(name), 'utf8')))
    const roles = classify(scan)
    return computeProfile(scan, (id) => roles[id] ?? 'internal', autoAlign(scan))
  }

  it('summarises the two-storey scan', () => {
    const profile = profileOf('MergedRooms_8.json')
    expect(isShapeProfile(profile)).toBe(true)
    expect(profile.storeys).toBe(2)
    expect(profile.floorArea).toBeGreaterThan(140)
    expect(profile.floorArea).toBeLessThan(160)
    expect(profile.windowArea).toBeGreaterThan(10)
    // Small enough to store and send for every home.
    expect(JSON.stringify(profile).length).toBeLessThan(10_000)
  })

  it('matches a home with itself almost perfectly', () => {
    const profile = profileOf('MergedRooms_8.json')
    expect(compare(profile, profile).score).toBeGreaterThanOrEqual(97)
  })
})

describe('factors nobody has filled in', () => {
  it("don't count towards the score or the reason", () => {
    const match = compare(home(), home(1.4))
    const insulation = match.factors.find((f) => f.key === 'insulation')!
    expect(insulation.informative).toBe(false)
    expect(insulation.yours).toBe('Not said')
    expect(summarise(match)).not.toMatch(/insulation/)
  })
})

describe('insulation', () => {
  const insulated = { walls: 'cavity-filled', loft: 'yes' }
  const partly = { walls: 'cavity-filled', loft: 'no' }
  const uninsulated = { walls: 'solid', loft: 'no' }
  const insulationOf = (yours: object, theirs: object) =>
    compare(home(), home(), { yours: { home: yours }, theirs: { home: theirs } }).factors.find((f) => f.key === 'insulation')!

  it('is compared when both owners have said', () => {
    const same = insulationOf(insulated, insulated)
    expect(same.informative).toBe(true)
    expect(same.similarity).toBe(1)
    expect(same.yours).toBe('Insulated')
    expect(insulationOf(insulated, partly).similarity).toBe(0.5)
    expect(insulationOf(insulated, uninsulated).similarity).toBe(0)
  })

  it('is not counted when only one has', () => {
    expect(insulationOf(insulated, {}).informative).toBe(false)
  })

  it('makes a differently insulated home a weaker match', () => {
    const score = (theirs: object) => compare(home(), home(), { yours: { home: insulated }, theirs: { home: theirs } }).score
    expect(score(uninsulated)).toBeLessThan(score(insulated))
  })

  it('leaves party walls out of the comparison', () => {
    expect(compare(home(), home()).factors.some((f) => (f.key as string) === 'party')).toBe(false)
  })
})

describe('estimateFor', () => {
  const data = (designHeatLossW: number, capacityKw: number, scop: number, heat: number) => ({
    source: 'sample',
    designHeatLossW,
    designOutdoorTemperature: -2,
    heatPump: { make: 'Make', model: 'Model', capacityKw },
    annual: { heatDeliveredKwh: heat, electricityKwh: heat / scop, scop },
  })

  it('scales close matches to your floor area and gives ranges', async () => {
    const { estimateFor } = await import('./heatPump')
    const estimate = estimateFor(100, [
      { score: 90, floorArea: 100, heatPump: data(5000, 6, 3.8, 10000) },
      // Twice your size: its heat loss and heat use are halved for you.
      { score: 80, floorArea: 200, heatPump: data(12000, 12, 3.2, 24000) },
      // Too poor a match to count.
      { score: 40, floorArea: 100, heatPump: data(20000, 16, 2.5, 40000) },
      // No figures.
      { score: 95, floorArea: 100, heatPump: null },
    ])!
    expect(estimate.basedOn).toBe(2)
    expect(estimate.heatLossKw).toEqual([5, 6])
    expect(estimate.heatPumpKw).toEqual([6, 12])
    expect(estimate.scop).toEqual([3.2, 3.8])
    expect(estimate.annualHeatKwh).toEqual([10000, 12000])
    expect(estimate.sample).toBe(true)
  })

  it('gives no estimate without good matches that have figures', async () => {
    const { estimateFor } = await import('./heatPump')
    expect(estimateFor(100, [{ score: 50, floorArea: 100, heatPump: data(5000, 6, 3.8, 10000) }])).toBeNull()
  })
})
