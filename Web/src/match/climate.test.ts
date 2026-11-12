import { describe, expect, it } from 'vitest'
import { climateFor, designTemperatureFor } from './climate'
import { estimateFor } from './heatPump'
import { compare } from './similarity'
import type { ShapeProfile } from './profile'

describe('climateFor', () => {
  // Spot checks against MCS 031 a) Appendix A, Table 1, including its worked example (CF).
  it('looks up the postcode area from MCS 031', () => {
    expect(climateFor('CF10')).toEqual({ area: 'CF', designTemperature: -3.1, degreeDays: 1835 })
    expect(climateFor('AB12')).toEqual({ area: 'AB', designTemperature: -5.4, degreeDays: 2668 })
    expect(designTemperatureFor('PL4')).toBe(-1.5)
    expect(designTemperatureFor('SW1A 1AA')).toBe(-3)
  })

  it('tells one-letter areas from two-letter ones', () => {
    expect(climateFor('W1')?.area).toBe('W')
    expect(climateFor('WC2N')?.area).toBe('WC')
    expect(climateFor('G1')?.designTemperature).toBe(-5.6)
  })

  it('is null for anything that is not a known postcode', () => {
    expect(climateFor('')).toBeNull()
    expect(climateFor(null)).toBeNull()
    expect(climateFor('London')).toBeNull()
  })
})

describe('estimateFor across climates', () => {
  // 100 W/K: 2.3 kW at −2 °C, 2.6 kW at −5 °C (indoors 21 °C).
  const quoted = (designOutdoorTemperature?: number) => ({
    source: 'owner',
    designHeatLossW: designOutdoorTemperature === undefined ? 2300 : 100 * (21 - designOutdoorTemperature),
    designOutdoorTemperature,
  })

  it('compares heat loss per degree and gives it at your design temperature', () => {
    const estimate = estimateFor(100, [{ score: 90, floorArea: 100, heatPump: quoted(-5) }], -2)!
    expect(estimate.heatLossKw[0]).toBeCloseTo(2.3)
    expect(estimate.designTemperature).toBe(-2)
  })

  it('uses their area’s design temperature when the figures don’t say', () => {
    const estimate = estimateFor(100, [{ score: 90, floorArea: 100, heatPump: quoted(), designTemperature: -2 }], -5.4)!
    expect(estimate.heatLossKw[0]).toBeCloseTo(2.64)
  })

  it('keeps figures as quoted when a temperature isn’t known', () => {
    expect(estimateFor(100, [{ score: 90, floorArea: 100, heatPump: quoted(-5) }])!.heatLossKw[0]).toBeCloseTo(2.6)
    const unknown = estimateFor(100, [{ score: 90, floorArea: 100, heatPump: quoted() }], -2)!
    expect(unknown.heatLossKw[0]).toBeCloseTo(2.3)
    expect(unknown.designTemperature).toBeNull()
  })
})

describe('compare with home details', () => {
  const square: ShapeProfile = {
    version: 1,
    floorArea: 64,
    storeys: 1,
    externalWallArea: 80,
    partyWallArea: 0,
    windowArea: 10,
    plans: [[[[0, 0], [8, 0], [8, 8], [0, 8]]]],
  }
  const factor = (m: ReturnType<typeof compare>, key: string) => m.factors.find((f) => f.key === key)!

  it('leaves fabric and climate out when they aren’t known', () => {
    const match = compare(square, square)
    expect(factor(match, 'fabric').informative).toBe(false)
    expect(factor(match, 'climate').informative).toBe(false)
    expect(match.score).toBeGreaterThanOrEqual(99)
  })

  it('scores homes built alike, in a similar climate, higher', () => {
    const semi = { propertyType: 'semi-detached', ageBand: '1945-1964', walls: 'cavity-filled' }
    const alike = compare(square, square, {
      yours: { home: semi, postcodeDistrict: 'SW1A' },
      theirs: { home: semi, postcodeDistrict: 'CR0' },
    })
    const different = compare(square, square, {
      yours: { home: semi, postcodeDistrict: 'SW1A' },
      theirs: { home: { propertyType: 'detached', ageBand: '1965-1982', walls: 'solid' }, postcodeDistrict: 'IV1' },
    })
    expect(factor(alike, 'fabric').similarity).toBe(1)
    expect(factor(alike, 'climate').similarity).toBe(1)
    // Neighbouring age bands count half; nothing else agrees.
    expect(factor(different, 'fabric').similarity).toBeCloseTo(0.5 / 3)
    expect(different.score).toBeLessThan(alike.score)
  })

  it('ignores answers either owner wasn’t sure of', () => {
    const match = compare(square, square, { yours: { home: { walls: 'not-sure' } }, theirs: { home: { walls: 'solid' } } })
    expect(factor(match, 'fabric').informative).toBe(false)
  })
})

describe('otherHomes', () => {
  it('leaves out uploads of the open scan, however many there are', async () => {
    const { otherHomes } = await import('./candidates')
    const candidate = (id: string, scanHash?: string) => ({
      id,
      createdAt: '2026-11-12T00:00:00Z',
      profile: { version: 1 as const, scanHash, floorArea: 50, storeys: 1, externalWallArea: 0, partyWallArea: 0, windowArea: 0, plans: [] },
      heatPump: null,
      share: null,
    })
    const list = [candidate('mine', 'abc12345'), candidate('mine-again', 'abc12345'), candidate('theirs', 'def67890'), candidate('old')]
    expect(otherHomes(list, 'abc12345').map((c) => c.id)).toEqual(['theirs', 'old'])
  })
})
