import { describe, expect, it } from 'vitest'
import { outwardCode } from './postcode'

describe('outwardCode', () => {
  it('accepts the first part of a postcode', () => {
    expect(outwardCode('sw1a')).toBe('SW1A')
    expect(outwardCode(' M1 ')).toBe('M1')
    expect(outwardCode('EH12')).toBe('EH12')
  })

  it('cuts a full postcode down to its first part', () => {
    expect(outwardCode('SW1A 1AA')).toBe('SW1A')
    expect(outwardCode('m11ae')).toBe('M1')
    expect(outwardCode('EH12 9DN')).toBe('EH12')
  })

  it('rejects things that are not postcodes', () => {
    expect(outwardCode('')).toBeNull()
    expect(outwardCode('London')).toBeNull()
    expect(outwardCode('12345')).toBeNull()
  })
})
