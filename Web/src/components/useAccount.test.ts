import { describe, expect, it } from 'vitest'
import { homeHref } from './useAccount'

describe('homeHref', () => {
  it('takes signed-in users to their scans and everyone else to open a scan', () => {
    expect(homeHref(true)).toBe('/scans')
    expect(homeHref(false)).toBe('/new')
    // Before sign-in has loaded.
    expect(homeHref(undefined)).toBe('/new')
  })
})
