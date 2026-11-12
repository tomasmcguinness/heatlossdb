import { describe, expect, it } from 'vitest'
import type { HomeFabric } from '../fabric/store'
import { listingName } from './listing'

const home: HomeFabric = { ageBand: '1945-1964', propertyType: 'detached', walls: 'cavity-filled', loft: 'yes' }

describe('listingName', () => {
  it('names the type, age and insulation', () => {
    expect(listingName(home)).toBe('Detached, 1945–64, insulated home')
  })

  it('says how well insulated the walls and loft are', () => {
    expect(listingName({ ...home, loft: 'no' })).toBe('Detached, 1945–64, partly insulated home')
    expect(listingName({ ...home, walls: 'solid', loft: 'no' })).toBe('Detached, 1945–64, uninsulated home')
  })

  it('goes by the walls alone when there is no loft', () => {
    expect(listingName({ ...home, loft: 'none' })).toBe('Detached, 1945–64, insulated home')
    expect(listingName({ ...home, walls: 'solid', loft: 'none' })).toBe('Detached, 1945–64, uninsulated home')
  })

  it('leaves out what the user did not say or is not sure of', () => {
    expect(listingName({ ...home, walls: 'not-sure', propertyType: 'terraced', ageBand: 'pre-1919' })).toBe('Terraced, pre-1919 home')
    expect(listingName({ ...home, ageBand: 'not-sure' })).toBe('Detached, insulated home')
    expect(listingName({ ...home, loft: undefined })).toBe('Detached, 1945–64 home')
    expect(listingName({})).toBe('Home')
    expect(listingName({ walls: 'solid', loft: 'no' })).toBe('Uninsulated home')
  })
})
