import { beforeEach, describe, expect, it } from 'vitest'
import { readShare, saveShare } from './share'

// Node has no browser storage, so give it a simple one.
beforeEach(() => {
  const items = new Map<string, string>()
  globalThis.sessionStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as Storage
})

describe('shares', () => {
  it('are kept per scan', () => {
    const share = { name: 'Detached home', sharedAt: '2026-11-12T00:00:00Z' }
    saveShare('abc', share)
    expect(readShare('abc')).toEqual(share)
    expect(readShare('other')).toBeNull()
  })
})
