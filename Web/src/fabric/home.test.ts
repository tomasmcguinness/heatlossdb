import { describe, expect, it } from 'vitest'
import {
  answeredCount,
  customFabricCount,
  hasCustomFabric,
  hasRoomFabric,
  isHomeFabricSet,
  itemFabricValue,
  QUESTION_COUNT,
  roomFabricValue,
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
