import { describe, expect, it } from 'vitest'
import { answeredCount, hasCustomFabric, isHomeFabricSet, QUESTION_COUNT } from './home'

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
