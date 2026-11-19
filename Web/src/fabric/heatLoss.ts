/** A heated room's figures from its heat loss report: the temperature it's designed to be kept at,
 *  and how much heat it loses at the home's design outdoor temperature. */

export const MIN_TARGET_TEMPERATURE = 5
export const MAX_TARGET_TEMPERATURE = 35
export const MAX_HEAT_LOSS = 50_000

export const TARGET_TEMPERATURE_ERROR = `Enter a temperature from ${MIN_TARGET_TEMPERATURE} to ${MAX_TARGET_TEMPERATURE} °C, like 21, or leave it blank.`
export const HEAT_LOSS_ERROR = `Enter the heat loss in watts, from 0 to ${MAX_HEAT_LOSS.toLocaleString('en-GB')}, like 1250, or leave it blank.`

/** A typed number: undefined when blank, null when it isn't a number in [min, max]. A comma is read
 *  as a decimal point, unless it groups thousands ("1,250"); a trailing unit ("°C", "W") is allowed. */
function parseWithin(text: string, min: number, max: number, unit: RegExp): number | undefined | null {
  let trimmed = text.trim().replace(unit, '').trim()
  if (!trimmed) return undefined
  trimmed = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed) ? trimmed.replace(/,/g, '') : trimmed.replace(',', '.')
  if (!/^\d*\.?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value >= min && value <= max ? value : null
}

export const parseTargetTemperature = (text: string) =>
  parseWithin(text, MIN_TARGET_TEMPERATURE, MAX_TARGET_TEMPERATURE, /\s*°?\s*c$/i)

/** Watts, rounded to the nearest watt. A value given in kW ("1.25 kW") is converted. */
export function parseHeatLoss(text: string): number | undefined | null {
  const kilowatts = /\s*kw$/i.test(text.trim())
  const value = kilowatts ? parseWithin(text, 0, MAX_HEAT_LOSS / 1000, /\s*kw$/i) : parseWithin(text, 0, MAX_HEAT_LOSS, /\s*w$/i)
  return typeof value === 'number' ? Math.round(kilowatts ? value * 1000 : value) : value
}

export const formatTargetTemperature = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} °C`

export const formatHeatLoss = (value: number) => `${Math.round(value).toLocaleString('en-GB')} W`

/** What a room's label shows: "21 °C · 1,250 W", either one alone, or nothing. */
export function roomFigures(room: { heated: boolean; targetTemperature?: number; heatLossW?: number }): string | null {
  if (!room.heated) return null
  const parts = [
    room.targetTemperature !== undefined && formatTargetTemperature(room.targetTemperature),
    room.heatLossW !== undefined && formatHeatLoss(room.heatLossW),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}
