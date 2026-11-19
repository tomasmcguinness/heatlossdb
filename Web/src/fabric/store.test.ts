import { beforeEach, describe, expect, it } from 'vitest'
import { openFile } from '../components/files'
import { parseScan } from '../scan/parse'
import type { RawSurface } from '../scan/types'
import { editedRoom, effectiveField, effectiveRole, effectiveUValue, isFabricDocument, useFabric } from './store'

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

describe('rooms', () => {
  const room = {
    id: 'room-0-0',
    story: 0,
    name: 'Bedroom',
    centre: [0, 0] as [number, number],
    area: 12,
    shape: '',
    elements: [
      { id: 'w1', kind: 'window' as const, width: 1.2, height: 1.1 },
      { id: 'w2', kind: 'window' as const, width: 0.6, height: 1.1 },
    ],
  }

  it('applies the user’s corrections', () => {
    state().setRoom(room.id, () => ({ name: 'Study', heated: false, removedElements: ['w2'], added: [{ id: 'a', kind: 'skylight' }] }))
    const edited = editedRoom(room, state().rooms[room.id])
    expect(edited.name).toBe('Study')
    expect(edited.heated).toBe(false)
    expect(edited.checked).toBe(false)
    expect(edited.items.map((i) => i.id)).toEqual(['w1', 'a'])
  })

  it('keeps the scanned name when the name is cleared', () => {
    expect(editedRoom(room, { name: '  ' }).name).toBe('Bedroom')
  })

  it('round-trips with the rest of the settings', () => {
    state().setRoom(room.id, (s) => ({ ...s, checked: true }))
    const doc = state().exportFabric()!
    state().loadScan(scan)
    expect(state().rooms).toEqual({})
    state().importFabric(doc)
    expect(state().rooms[room.id]).toEqual({ checked: true })
  })

  it('keeps the home fabric', () => {
    state().applyHome({ propertyType: 'detached', ageBand: '1945-1964' })
    const doc = state().exportFabric()!
    state().loadScan(scan)
    state().importFabric(doc)
    expect(state().home).toEqual({ propertyType: 'detached', ageBand: '1945-1964', applied: true })
    const { home: _, ...older } = doc
    expect(isFabricDocument(older)).toBe(true)
    state().importFabric(older)
    expect(state().home).toEqual({})
  })

  it('replaces elements’ own fabric when applied, but keeps their roles', () => {
    state().setRole('outer', 'party')
    state().setUValue('outer', 0.3)
    state().setField('middle', 'construction', 'brick')
    state().applyHome({ walls: 'solid' })
    expect(state().elements).toEqual({ outer: { role: 'party' } })
  })

  it('drops a room’s fabric when it goes back to the same as home', () => {
    state().setRoom('r', (s) => ({ ...s, fabric: { walls: 'solid' }, itemFabric: { w1: 'triple' } }))
    state().setRoom('r', (s) => ({ ...s, fabric: { ...s.fabric, walls: undefined }, itemFabric: { ...s.itemFabric, w1: '' } }))
    expect(state().rooms.r).toEqual({})
  })

  it('replaces rooms’ own fabric when applied, but keeps their corrections', () => {
    const added = [{ id: 'a', kind: 'skylight' as const }]
    state().setRoom('r', () => ({ name: 'Study', heated: false, checked: true, added, fabric: { walls: 'solid' }, itemFabric: { a: 'triple' } }))
    const doc = state().exportFabric()!
    state().loadScan(scan)
    state().importFabric(doc)
    expect(state().rooms.r.itemFabric).toEqual({ a: 'triple' })
    state().applyHome({ walls: 'cavity-filled' })
    expect(state().rooms.r).toEqual({ name: 'Study', heated: false, checked: true, added })
  })

  it('keeps the home’s air changes but clears rooms’ own when applied', () => {
    state().setRoom('r', (s) => ({ ...s, fabric: { airChangesPerHour: 3 } }))
    const doc = state().exportFabric()!
    state().loadScan(scan)
    state().importFabric(doc)
    expect(state().rooms.r.fabric).toEqual({ airChangesPerHour: 3 })
    state().applyHome({ airChangesPerHour: 1.5 })
    expect(state().rooms.r).toEqual({})
    expect(state().home).toEqual({ airChangesPerHour: 1.5, applied: true })
  })

  it('drops a room’s air changes when cleared', () => {
    state().setRoom('r', (s) => ({ ...s, fabric: { airChangesPerHour: 2 } }))
    state().setRoom('r', (s) => ({ ...s, fabric: { ...s.fabric, airChangesPerHour: undefined } }))
    expect(state().rooms.r).toEqual({})
  })

  it('still accepts documents saved before rooms were added', () => {
    const { rooms: _, ...older } = state().exportFabric()!
    expect(isFabricDocument(older)).toBe(true)
    state().importFabric(older)
    expect(state().rooms).toEqual({})
  })
})

describe('a room’s heat loss figures', () => {
  it('are carried into the room, kept by Home fabric and saved with the edits', () => {
    state().setRoom('scanroom-0', (s) => ({ ...s, targetTemperature: 21, heatLossW: 1250 }))
    const plain = { id: 'scanroom-0', story: 0, name: 'Room 1', centre: [0, 0] as [number, number], area: 12, shape: '', elements: [] }
    expect(editedRoom(plain, state().rooms['scanroom-0'])).toMatchObject({ heated: true, targetTemperature: 21, heatLossW: 1250 })

    state().applyHome({ walls: 'solid' })
    const doc = state().exportFabric()!
    state().loadScan(scan)
    state().importFabric(doc)
    expect(state().rooms['scanroom-0']).toEqual({ targetTemperature: 21, heatLossW: 1250 })
  })
})

describe('saved files', () => {
  // What Save writes: the scan as opened, its format version and the edits.
  const saved = () => ({ ...state().scan!.raw, heatlossdbVersion: 1, edits: state().exportFabric() })

  it('keep the scan without any edits', () => {
    state().setRole('outer', 'party')
    const reopened = parseScan(saved())
    expect(reopened.hash).toBe(scan.hash)
    expect(reopened.raw?.edits).toBeUndefined()
  })

  it('open with their edits', async () => {
    state().setRole('outer', 'party')
    const file = new File([JSON.stringify(saved())], 'home.json')
    state().setRole('outer', undefined)
    await openFile(file)
    expect(effectiveRole(state(), 'outer')).toBe('party')
  })

  it('are refused when made by a newer version', () => {
    expect(() => parseScan({ ...saved(), heatlossdbVersion: 2 })).toThrow(/newer version/)
  })
})

describe('another version of the floor plan', () => {
  // As the tidier might leave it: the middle wall merged away and an inferred wall added.
  const tidied = parseScan({
    ...scan.raw!,
    walls: [surface('outer', 'wall'), surface('inferred', 'wall', { transform: at(0, 1.2, 2) })],
    heatlossdbTidy: { version: 1 },
  })
  const nudged = { rotation: 5, dx: 0.5, dz: 0 }

  it('is a different scan', () => {
    expect(tidied.hash).not.toBe(scan.hash)
  })

  it('takes the storeys’ alignment only from the same scan', () => {
    state().setAlignment(0, nudged)
    const doc = state().exportFabric()!
    state().loadScan(scan)
    state().importFabric(doc)
    expect(state().alignment[0]).toEqual(nudged)

    state().loadScan(tidied)
    state().importFabric(doc)
    expect(state().alignment).toEqual(state().autoAlignment)
  })

  it('keeps the user’s edits when switched to', () => {
    state().applyHome({ walls: 'solid', airChangesPerHour: 1.5 })
    state().setRole('outer', 'party')
    state().setRole('middle', 'external')
    state().setRoom('r', (s) => ({ ...s, name: 'Study', fabric: { airChangesPerHour: 3 } }))
    state().setAlignment(0, nudged)
    state().setTab('defaults')

    state().switchScan(tidied)

    expect(state().scan).toBe(tidied)
    expect(state().home).toEqual({ walls: 'solid', airChangesPerHour: 1.5, applied: true })
    expect(state().rooms.r).toEqual({ name: 'Study', fabric: { airChangesPerHour: 3 } })
    // The middle wall isn't in the tidied plan, so its role goes.
    expect(state().elements).toEqual({ outer: { role: 'party' } })
    expect(state().alignment).toEqual(state().autoAlignment)
    expect(state().tab).toBe('defaults')
  })

  it('is still the same home', () => {
    expect(state().homeKey).toBe(scan.hash)
    state().switchScan(tidied)
    expect(state().homeKey).toBe(scan.hash)
    state().loadScan(tidied, undefined, 'survey:abc')
    expect(state().homeKey).toBe('survey:abc')
    state().switchScan(scan)
    expect(state().homeKey).toBe('survey:abc')
  })

  it('can be switched back from, keeping edits made on it', () => {
    state().switchScan(tidied)
    state().setRoom('r', (s) => ({ ...s, name: 'Office' }))
    state().switchScan(scan)
    expect(state().scan).toBe(scan)
    expect(state().rooms.r).toEqual({ name: 'Office' })
  })
})
