import { describe, expect, it } from 'vitest'
import { formatHeatLoss, formatTargetTemperature, MAX_HEAT_LOSS, parseHeatLoss, parseTargetTemperature, roomFigures } from './heatLoss'

describe('Target temperature', () => {
  it('reads typed temperatures, with or without the unit', () => {
    expect(parseTargetTemperature('')).toBeUndefined()
    expect(parseTargetTemperature(' 21 ')).toBe(21)
    expect(parseTargetTemperature('18.5')).toBe(18.5)
    expect(parseTargetTemperature('18,5')).toBe(18.5)
    expect(parseTargetTemperature('22°C')).toBe(22)
    expect(parseTargetTemperature('22 c')).toBe(22)
  })

  it('rejects anything outside 5–35 °C or not a number', () => {
    for (const bad of ['4', '36', '-5', 'warm', '21.5.1']) expect(parseTargetTemperature(bad)).toBeNull()
  })

  it('reads as degrees', () => {
    expect(formatTargetTemperature(21)).toBe('21 °C')
    expect(formatTargetTemperature(18.5)).toBe('18.5 °C')
  })
})

describe('Room heat loss', () => {
  it('reads watts, thousands separators and kilowatts', () => {
    expect(parseHeatLoss('')).toBeUndefined()
    expect(parseHeatLoss('1250')).toBe(1250)
    expect(parseHeatLoss('1,250')).toBe(1250)
    expect(parseHeatLoss('1250 W')).toBe(1250)
    expect(parseHeatLoss('1.25 kW')).toBe(1250)
    expect(parseHeatLoss('0')).toBe(0)
    expect(parseHeatLoss('812.6')).toBe(813)
  })

  it('rejects negative, huge or non-numeric values', () => {
    for (const bad of ['-1', String(MAX_HEAT_LOSS + 1), 'lots', '51 kW']) expect(parseHeatLoss(bad)).toBeNull()
  })

  it('reads as watts', () => {
    expect(formatHeatLoss(1250)).toBe('1,250 W')
  })
})

describe('A room’s figures on the plan', () => {
  it('show what’s set, for heated rooms only', () => {
    expect(roomFigures({ heated: true, targetTemperature: 21, heatLossW: 1250 })).toBe('21 °C · 1,250 W')
    expect(roomFigures({ heated: true, heatLossW: 640 })).toBe('640 W')
    expect(roomFigures({ heated: true, targetTemperature: 18 })).toBe('18 °C')
    expect(roomFigures({ heated: true })).toBeNull()
    expect(roomFigures({ heated: false, targetTemperature: 21, heatLossW: 1250 })).toBeNull()
  })
})
