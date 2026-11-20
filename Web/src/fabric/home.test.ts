import { describe, expect, it } from 'vitest'
import {
  answeredCount,
  customFabricCount,
  formatAirChanges,
  hasCustomFabric,
  hasRoomFabric,
  homeInsulation,
  isHomeFabricSet,
  itemFabricValue,
  MAX_AIR_CHANGES,
  parseAirChanges,
  QUESTION_COUNT,
  roomAirChanges,
  roomFabricValue,
  wallCavity,
} from './home'

describe('Home fabric', () => {
  it('counts the seven main questions answered', () => {
    expect(QUESTION_COUNT).toBe(7)
    expect(answeredCount({})).toBe(0)
    // "Not sure" is an answer; follow-ups and made-up values aren't counted.
    expect(answeredCount({ propertyType: 'terraced', ageBand: 'not-sure', loft: 'yes', loftDepth: 'above', floorInsulation: 'no' })).toBe(3)
    expect(answeredCount({ walls: 'made-up' })).toBe(0)
  })

  it('is set once applied, however many questions were answered', () => {
    expect(isHomeFabricSet({ walls: 'solid' })).toBe(false)
    expect(isHomeFabricSet({ applied: true })).toBe(true)
  })

  it('finds elements with their own fabric, but not ones with just a role', () => {
    expect(hasCustomFabric({ role: 'party' })).toBe(false)
    expect(hasCustomFabric({ uValue: 0.3 })).toBe(true)
    expect(hasCustomFabric({ fields: { construction: 'brick' } })).toBe(true)
  })
})

describe('Room fabric', () => {
  const home = { walls: 'solid', loft: 'yes', loftDepth: 'above', floorType: 'suspended-timber', windows: 'double', doors: 'composite' }
  const middle = { ground: false, top: false }
  const both = { ground: true, top: true }

  it('is the home’s unless the room has its own', () => {
    expect(roomFabricValue(home, undefined, middle, 'walls')).toEqual({ value: 'solid', own: false })
    expect(roomFabricValue(home, { fabric: { walls: 'cavity-filled' } }, middle, 'walls')).toEqual({ value: 'cavity-filled', own: true })
  })

  it('only lets top storey rooms change the ceiling, and ground storey rooms the floor', () => {
    const settings = { fabric: { loft: 'no', floorType: 'solid' } }
    expect(roomFabricValue(home, settings, middle, 'loft').value).toBe('yes')
    expect(roomFabricValue(home, settings, middle, 'floorType').value).toBe('suspended-timber')
    expect(roomFabricValue(home, settings, both, 'loft').value).toBe('no')
    expect(roomFabricValue(home, settings, both, 'floorType').value).toBe('solid')
  })

  it('doesn’t take the home’s loft depth for a room with its own loft', () => {
    expect(roomFabricValue(home, { fabric: { loft: 'yes' } }, both, 'loftDepth')).toEqual({ value: undefined, own: true })
    expect(roomFabricValue(home, {}, both, 'loftDepth')).toEqual({ value: 'above', own: false })
  })

  it('gives doors the home’s door type and windows and skylights its glazing', () => {
    const settings = { itemFabric: { w1: 'triple' } }
    expect(itemFabricValue(home, settings, { id: 'w1', kind: 'window' })).toEqual({ value: 'triple', own: true })
    expect(itemFabricValue(home, settings, { id: 's1', kind: 'skylight' })).toEqual({ value: 'double', own: false })
    expect(itemFabricValue(home, settings, { id: 'd1', kind: 'door' })).toEqual({ value: 'composite', own: false })
  })

  it('counts each room, door and window with its own fabric', () => {
    expect(hasRoomFabric({ name: 'Study' })).toBe(false)
    expect(hasRoomFabric({ itemFabric: { w1: 'triple' } })).toBe(true)
    const rooms = { a: { fabric: { walls: 'solid' }, itemFabric: { w1: 'triple', d1: 'composite' } }, b: { checked: true } }
    expect(customFabricCount({ outer: { uValue: 0.3 }, middle: { role: 'party' } }, rooms)).toBe(4)
  })
})

describe('Cavity walls', () => {
  const filled = { walls: 'cavity-filled', applied: true }

  it('are shown only once Home fabric is applied', () => {
    expect(wallCavity({ walls: 'cavity-filled' }, undefined)).toBeNull()
    expect(wallCavity(filled, undefined)).toBe('filled')
    expect(wallCavity({ walls: 'cavity-unfilled', applied: true }, undefined)).toBe('empty')
  })

  it('follow a room’s own outside walls over the home’s', () => {
    expect(wallCavity(filled, { fabric: { walls: 'cavity-unfilled' } })).toBe('empty')
    expect(wallCavity(filled, { fabric: { walls: 'solid' } })).toBeNull()
    expect(wallCavity({ walls: 'solid', applied: true }, { fabric: { walls: 'cavity-filled' } })).toBe('filled')
  })

  it('aren’t drawn for any other answer', () => {
    for (const walls of ['solid', 'timber-frame', 'not-sure', undefined]) expect(wallCavity({ walls, applied: true }, undefined)).toBeNull()
  })
})

describe('The home’s insulation in the side view', () => {
  it('shows nothing until Home fabric is applied', () => {
    expect(homeInsulation({ loft: 'yes', walls: 'cavity-filled', floorInsulation: 'yes' })).toEqual({ loft: null, walls: null, floor: false })
  })

  it('shows the loft, walls and floor insulation it says is there', () => {
    expect(homeInsulation({ applied: true, loft: 'yes', loftDepth: 'above', walls: 'cavity-filled', floorInsulation: 'yes' })).toEqual({
      loft: 'deep',
      walls: 'filled',
      floor: true,
    })
    expect(homeInsulation({ applied: true, loft: 'yes', walls: 'cavity-unfilled' })).toEqual({ loft: 'shallow', walls: 'empty', floor: false })
    expect(homeInsulation({ applied: true, loft: 'yes', loftDepth: 'below' }).loft).toBe('shallow')
  })

  it('shows nothing for no, none or not sure', () => {
    for (const loft of ['no', 'none', 'not-sure']) expect(homeInsulation({ applied: true, loft }).loft).toBeNull()
    expect(homeInsulation({ applied: true, floorInsulation: 'not-sure' }).floor).toBe(false)
  })
})

describe('Air changes per hour', () => {
  it('is the home’s unless the room has its own', () => {
    expect(roomAirChanges({ airChangesPerHour: 1.5 }, undefined)).toEqual({ value: 1.5, own: false })
    expect(roomAirChanges({}, {})).toEqual({ value: undefined, own: false })
    expect(roomAirChanges({ airChangesPerHour: 1.5 }, { fabric: { airChangesPerHour: 3 } })).toEqual({ value: 3, own: true })
  })

  it('counts a room with only its own air changes as having its own fabric', () => {
    const rooms = { a: { fabric: { airChangesPerHour: 2 } } }
    expect(hasRoomFabric(rooms.a)).toBe(true)
    expect(customFabricCount({}, rooms)).toBe(1)
  })

  it('reads typed values, rejecting anything not above 0 and up to the maximum', () => {
    expect(parseAirChanges('')).toBeUndefined()
    expect(parseAirChanges('  ')).toBeUndefined()
    expect(parseAirChanges('1.5')).toBe(1.5)
    expect(parseAirChanges(' 2 ')).toBe(2)
    expect(parseAirChanges('.5')).toBe(0.5)
    expect(parseAirChanges('0,75')).toBe(0.75)
    expect(parseAirChanges(String(MAX_AIR_CHANGES))).toBe(MAX_AIR_CHANGES)
    for (const bad of ['0', '-1', 'abc', '1.5.2', '1e2', '21']) expect(parseAirChanges(bad)).toBeNull()
  })

  it('reads as so many per hour', () => {
    expect(formatAirChanges(1.5)).toBe('1.5 per hour')
    expect(formatAirChanges(undefined)).toBeUndefined()
  })
})
