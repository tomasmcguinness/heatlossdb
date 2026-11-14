import { describe, expect, it } from 'vitest'
import { parseComingSoon } from './features'

describe('parseComingSoon', () => {
  it('holds back nothing when unset', () => {
    expect(parseComingSoon(undefined).size).toBe(0)
    expect(parseComingSoon('').size).toBe(0)
  })

  it('reads a comma-separated list, ignoring spaces, case and unknown names', () => {
    expect([...parseComingSoon(' Search, explore ,view,nonsense')].sort()).toEqual(['explore', 'search'])
  })
})
