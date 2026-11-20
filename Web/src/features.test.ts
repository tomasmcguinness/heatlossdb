import { describe, expect, it } from 'vitest'
import { parseComingSoon, unlockedFeatures } from './features'

describe('parseComingSoon', () => {
  it('holds back nothing when unset', () => {
    expect(parseComingSoon(undefined).size).toBe(0)
    expect(parseComingSoon('').size).toBe(0)
  })

  it('reads a comma-separated list, ignoring spaces, case and unknown names', () => {
    expect([...parseComingSoon(' Search, explore ,view,nonsense')].sort()).toEqual(['explore', 'search'])
  })
})

describe('unlockedFeatures', () => {
  it('unlocks nothing without metadata', () => {
    expect(unlockedFeatures(undefined).size).toBe(0)
    expect(unlockedFeatures({}).size).toBe(0)
    expect(unlockedFeatures({ features: 'search' }).size).toBe(0)
  })

  it('unlocks the listed features, ignoring case and unknown names', () => {
    expect([...unlockedFeatures({ features: ['Search', 'nonsense', 3] })]).toEqual(['search'])
  })

  it('unlocks everything with early access', () => {
    expect(unlockedFeatures({ earlyAccess: true }).size).toBe(3)
    expect(unlockedFeatures({ earlyAccess: 'yes' }).size).toBe(0)
  })
})
