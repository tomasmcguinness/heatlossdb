import { describe, expect, it } from 'vitest'
import type { EditedRoom, HomeFabric } from '../fabric/store'
import { heatLossPerSquareMetre, reportedTotals, roomFacts, shareIdFromPath } from './sharedHome'

const room = (patch: Partial<EditedRoom> = {}): EditedRoom => ({
  id: 'scanroom-0',
  story: 0,
  name: 'Room 1',
  scannedName: 'Room 1',
  centre: [0, 0],
  area: 12.5,
  shape: '',
  elements: [],
  heated: true,
  checked: true,
  items: [],
  ...patch,
})

const home: HomeFabric = { walls: 'cavity-filled', loft: 'yes', windows: 'double', floorType: 'solid', airChangesPerHour: 1, applied: true }
const both = { ground: true, top: true }
const factsOf = (r: EditedRoom, settings = {}, placement = both) =>
  Object.fromEntries(roomFacts(r, home, settings, placement).map((f) => [f.label, f.own ? `${f.value} (own)` : f.value]))

describe('shareIdFromPath', () => {
  it('reads the id from a shared link', () => {
    expect(shareIdFromPath('/h/AbCdEfGhIjKlMnOpQrStU_')).toBe('AbCdEfGhIjKlMnOpQrStU_')
    expect(shareIdFromPath('/h/AbCdEfGhIjKlMnOpQrStU_/')).toBe('AbCdEfGhIjKlMnOpQrStU_')
  })

  it('ignores survey links and anything malformed', () => {
    expect(shareIdFromPath('/s/AbCdEfGhIjKlMnOpQrStU_')).toBeNull()
    expect(shareIdFromPath('/h/short')).toBeNull()
    expect(shareIdFromPath('/h/AbCdEfGhIjKlMnOpQrStU_/edit')).toBeNull()
  })
})

describe('roomFacts', () => {
  it('shows a heated room’s size, figures and the home’s fabric', () => {
    expect(factsOf(room({ targetTemperature: 21, heatLossW: 1250 }))).toEqual({
      'Floor area': '13 m²',
      Heated: 'Yes',
      'Design temperature': '21 °C',
      'Heat loss': '1,250 W',
      'Heat loss per m²': '100 W/m²',
      'Air changes': '1 per hour',
      'Outside walls': 'Cavity, filled',
      Loft: 'Insulated',
      Floor: 'Solid concrete',
      Windows: 'Double, 2002 or newer',
    })
  })

  it('leaves out an unheated room’s figures', () => {
    const facts = factsOf(room({ heated: false, targetTemperature: 21, heatLossW: 1250 }))
    expect(facts.Heated).toBe('No')
    expect(facts['Heat loss']).toBeUndefined()
    expect(facts['Design temperature']).toBeUndefined()
  })

  it('marks where the room is built differently from the home', () => {
    const facts = factsOf(room(), { fabric: { walls: 'solid', airChangesPerHour: 2 } })
    expect(facts['Outside walls']).toBe('Solid brick or stone (own)')
    expect(facts['Air changes']).toBe('2 per hour (own)')
  })

  it('only shows the loft on the top storey and the floor on the ground storey', () => {
    const middle = factsOf(room(), {}, { ground: false, top: false })
    expect(middle.Loft).toBeUndefined()
    expect(middle.Floor).toBeUndefined()
  })
})

describe('heatLossPerSquareMetre', () => {
  it('needs a heated room with a figure and an area', () => {
    expect(heatLossPerSquareMetre(room({ heatLossW: 1000, area: 10 }))).toBe(100)
    expect(heatLossPerSquareMetre(room({ heatLossW: 1000, area: null }))).toBeUndefined()
    expect(heatLossPerSquareMetre(room({ area: 10 }))).toBeUndefined()
    expect(heatLossPerSquareMetre(room({ heated: false, heatLossW: 1000, area: 10 }))).toBeUndefined()
  })
})

describe('reportedTotals', () => {
  it('adds up the heated rooms that have a figure and counts the rest as missing, not zero', () => {
    const totals = reportedTotals([
      room({ heatLossW: 1000 }),
      room({ heatLossW: 500 }),
      room(),
      room({ heated: false, heatLossW: 300 }),
    ])
    expect(totals).toEqual({ heatLossW: 1500, withFigures: 2, heated: 3 })
  })
})
