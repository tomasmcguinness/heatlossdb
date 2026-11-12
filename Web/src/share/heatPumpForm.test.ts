import { describe, expect, it } from 'vitest'
import { EMPTY_HEAT_PUMP_FORM, heatPumpRecord, isHeatPumpFormEmpty, type HeatPumpForm } from './heatPumpForm'

const form = (fields: Partial<HeatPumpForm>) => ({ ...EMPTY_HEAT_PUMP_FORM, ...fields })

describe('heatPumpRecord', () => {
  it('turns the form into the figures the API stores', () => {
    const result = heatPumpRecord(form({ makeAndModel: ' Vaillant  aroTHERM plus 7 ', outputKw: '7', heatLossKw: '6,2', outdoorTemperature: '−2' }))
    expect(result).toEqual({
      record: {
        source: 'owner',
        designHeatLossW: 6200,
        heatLossBasis: 'survey',
        heatPump: { make: 'Vaillant', model: 'aroTHERM plus 7', capacityKw: 7 },
        designOutdoorTemperature: -2,
      },
    })
  })

  it('saves the heat loss on its own', () => {
    expect(heatPumpRecord(form({ heatLossKw: '5' }))).toEqual({ record: { source: 'owner', designHeatLossW: 5000, heatLossBasis: 'survey' } })
  })

  it('needs the heat loss, and the heat pump’s model and output together', () => {
    expect(heatPumpRecord(form({ makeAndModel: 'Daikin Altherma 3', outputKw: '8' }))).toHaveProperty('error')
    expect(heatPumpRecord(form({ heatLossKw: '5', makeAndModel: 'Daikin Altherma 3' }))).toHaveProperty('error')
    expect(heatPumpRecord(form({ heatLossKw: '5', outputKw: '8' }))).toHaveProperty('error')
  })

  it('rejects figures that are out of range or not numbers', () => {
    expect(heatPumpRecord(form({ heatLossKw: '5000' }))).toHaveProperty('error')
    expect(heatPumpRecord(form({ heatLossKw: 'lots' }))).toHaveProperty('error')
    expect(heatPumpRecord(form({ heatLossKw: '5', outdoorTemperature: '25' }))).toHaveProperty('error')
  })

  it('treats a blank form as skipped', () => {
    expect(isHeatPumpFormEmpty(form({ makeAndModel: '  ' }))).toBe(true)
    expect(isHeatPumpFormEmpty(form({ heatLossKw: '5' }))).toBe(false)
  })
})
