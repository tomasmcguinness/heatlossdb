import { beforeEach, describe, expect, it } from 'vitest'
import { parseScan } from '../scan/parse'
import type { RawSurface } from '../scan/types'
import { effectiveField, effectiveRole, effectiveUValue, isFabricDocument, useFabric } from './store'

const at = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

function surface(identifier: string, category: string, extra: Partial<RawSurface> = {}): RawSurface {
  return {
    identifier,
    category: { [category]: {} },
    dimensions: [4, 2.4, 0],
    transform: at(0, 1.2, -2),
    parentIdentifier: null,
    story: 0,
    polygonCorners: [],
    ...extra,
  }
}

// One room: a 4 m square floor, an external wall with a window, and a wall across the middle.
const scan = parseScan({
  walls: [
    surface('outer', 'wall'),
    surface('middle', 'wall', { transform: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1.2, 0, 1] }),
  ],
  windows: [surface('win', 'window', { dimensions: [1, 1, 0], parentIdentifier: 'outer' })],
  doors: [],
  openings: [],
  floors: [
    surface('floor', 'floor', {
      dimensions: [4, 4, 0],
      transform: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
      polygonCorners: [
        [-2, -2, 0],
        [2, -2, 0],
        [2, 2, 0],
        [-2, 2, 0],
      ],
    }),
  ],
})

const state = () => useFabric.getState()
const element = (id: string) => state().byId.get(id)!

beforeEach(() => state().loadScan(scan))

describe('roles', () => {
  it('starts from the automatic guess', () => {
    expect(effectiveRole(state(), 'outer')).toBe('external')
    expect(effectiveRole(state(), 'middle')).toBe('internal')
  })

  it("lets windows follow their wall's role, including the user's override", () => {
    state().setRole('outer', 'party')
    expect(effectiveRole(state(), 'win')).toBe('party')
    state().setRole('outer', undefined)
    expect(effectiveRole(state(), 'win')).toBe('external')
  })
})

describe('defaults and overrides', () => {
  it('falls back to the default and reports where a value came from', () => {
    expect(effectiveField(state(), element('outer'), 'construction')).toEqual({ value: undefined, source: 'unset' })

    state().setDefaultField('wall', 'construction', 'Cavity')
    expect(effectiveField(state(), element('outer'), 'construction')).toEqual({ value: 'Cavity', source: 'default' })

    state().setField('outer', 'construction', 'Solid brick')
    expect(effectiveField(state(), element('outer'), 'construction')).toEqual({ value: 'Solid brick', source: 'element' })
    // Other walls still use the default.
    expect(effectiveField(state(), element('middle'), 'construction').value).toBe('Cavity')
  })

  it('handles U-values the same way', () => {
    state().setDefaultUValue('window', 2.8)
    expect(effectiveUValue(state(), element('win'))).toEqual({ value: 2.8, source: 'default' })
    state().setUValue('win', 1.4)
    expect(effectiveUValue(state(), element('win'))).toEqual({ value: 1.4, source: 'element' })
  })

  it('removes an element from the saved settings when reset', () => {
    state().setRole('outer', 'party')
    state().setField('outer', 'insulation', 'Cavity fill')
    state().resetElement('outer')
    expect(state().elements.outer).toBeUndefined()
  })

  it('drops an element once every override is cleared', () => {
    state().setField('outer', 'insulation', 'Cavity fill')
    state().setField('outer', 'insulation', undefined)
    expect(state().elements.outer).toBeUndefined()
  })
})

describe('export and import', () => {
  it('round-trips settings and ignores elements from other scans', () => {
    state().setDefaultField('wall', 'construction', 'Cavity')
    state().setField('win', 'glazing', 'Triple')
    state().setRole('middle', 'party')
    const doc = state().exportFabric()!
    expect(isFabricDocument(doc)).toBe(true)

    state().loadScan(scan) // starts empty again (no browser storage in tests)
    state().importFabric({ ...doc, elements: { ...doc.elements, 'not-in-this-scan': { role: 'party' } } })

    expect(state().defaults.wall.fields.construction).toBe('Cavity')
    expect(state().elements.win.fields?.glazing).toBe('Triple')
    expect(effectiveRole(state(), 'middle')).toBe('party')
    expect(state().elements['not-in-this-scan']).toBeUndefined()
  })
})
