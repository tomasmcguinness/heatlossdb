import { describe, expect, it } from 'vitest'
import type { Candidate } from './candidates'
import type { HeatPumpData } from './heatPump'
import type { ShapeProfile } from './profile'
import { byArea, matchesFilters, median, NO_FILTERS, searchArea, SORTERS, totalsOf } from './explore'

let next = 0
const home = (patch: {
  district?: string
  type?: string
  age?: string
  area?: number
  heatLossW?: number
  capacityKw?: number
  scop?: number
  basis?: 'survey' | 'measured'
  createdAt?: string
}): Candidate => {
  const heatPump: HeatPumpData | null =
    patch.heatLossW === undefined
      ? null
      : {
          source: 'owner',
          designHeatLossW: patch.heatLossW,
          heatLossBasis: patch.basis,
          heatPump: patch.capacityKw ? { make: 'Make', model: 'Model', capacityKw: patch.capacityKw } : undefined,
          annual: patch.scop ? { heatDeliveredKwh: 1, electricityKwh: 1, scop: patch.scop } : undefined,
        }
  return {
    id: `home-${next++}`,
    createdAt: patch.createdAt ?? '2026-01-01T00:00:00Z',
    profile: { floorArea: patch.area ?? 100, storeys: 2 } as ShapeProfile,
    heatPump,
    share: patch.district
      ? { name: 'Home', postcodeDistrict: patch.district, shareRoomNames: false, home: { propertyType: patch.type, ageBand: patch.age } }
      : null,
  }
}

describe('searchArea', () => {
  it('takes a postcode area, a district or a full postcode', () => {
    expect(searchArea('sw')).toBe('SW')
    expect(searchArea(' sw1a ')).toBe('SW1A')
    expect(searchArea('SW1A 1AA')).toBe('SW1A')
    expect(searchArea('')).toBeNull()
    expect(searchArea('not a postcode')).toBeNull()
  })
})

describe('matchesFilters', () => {
  const semi = home({ district: 'B91', type: 'semi-detached', age: '1945-1964', area: 85, heatLossW: 6000, capacityKw: 7, scop: 3.8 })
  const detached = home({ district: 'SW1A', type: 'detached', age: '2003-', area: 140, heatLossW: 9000, basis: 'survey' })
  const unshared = home({ area: 70 })

  const pick = (filters: Partial<typeof NO_FILTERS>) =>
    [semi, detached, unshared].filter((c) => matchesFilters(c, { ...NO_FILTERS, ...filters }))

  it('keeps every home with no filters', () => {
    expect(pick({})).toHaveLength(3)
  })

  it('filters by district, or by postcode area', () => {
    expect(pick({ area: 'B91' })).toEqual([semi])
    expect(pick({ area: 'SW' })).toEqual([detached])
  })

  it('keeps homes matching any of the chosen types and ages', () => {
    expect(pick({ propertyTypes: ['semi-detached', 'detached'] })).toEqual([semi, detached])
    expect(pick({ ageBands: ['2003-'] })).toEqual([detached])
  })

  it('filters by floor area band', () => {
    expect(pick({ floorArea: '60-90' })).toEqual([semi, unshared])
    expect(pick({ floorArea: '120-160' })).toEqual([detached])
  })

  it('filters by the data a home has', () => {
    expect(pick({ hasHeatPump: true })).toEqual([semi])
    expect(pick({ measured: true })).toEqual([semi])
    expect(pick({ installerCalc: true })).toEqual([detached])
  })
})

describe('sorting', () => {
  const low = home({ heatLossW: 3000, area: 100, createdAt: '2026-01-01T00:00:00Z' })
  const high = home({ heatLossW: 9000, area: 100, scop: 3.1, createdAt: '2026-03-01T00:00:00Z' })
  const none = home({ createdAt: '2026-02-01T00:00:00Z' })

  it('sorts by date, heat loss per m² and SCOP, with homes missing the figure last', () => {
    expect([low, high, none].sort(SORTERS.recent)).toEqual([high, none, low])
    expect([none, high, low].sort(SORTERS.lowest)).toEqual([low, high, none])
    expect([none, low, high].sort(SORTERS.highest)).toEqual([high, low, none])
    expect([none, low, high].sort(SORTERS.scop)[0]).toBe(high)
  })
})

describe('totals', () => {
  it('counts homes and takes the median heat loss per m² of those with figures', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
    const totals = totalsOf([home({ heatLossW: 5000, area: 100, capacityKw: 6, scop: 3.5 }), home({ heatLossW: 7000, area: 100 }), home({})])
    expect(totals).toEqual({ homes: 3, medianWattsPerM2: 60, withHeatPump: 1, measured: 1 })
  })

  it('groups homes by district, busiest first', () => {
    const rows = byArea([
      home({ district: 'B91', heatLossW: 5000, area: 100, capacityKw: 6 }),
      home({ district: 'B91', heatLossW: 7000, area: 100, capacityKw: 8 }),
      home({ district: 'SW1A', heatLossW: 4000, area: 100 }),
      home({}),
    ])
    expect(rows).toEqual([
      { district: 'B91', homes: 2, medianWattsPerM2: 60, typicalHeatPumpKw: 7 },
      { district: 'SW1A', homes: 1, medianWattsPerM2: 40, typicalHeatPumpKw: null },
    ])
  })
})
