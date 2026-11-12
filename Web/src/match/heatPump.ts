import { DEFAULT_INDOOR_TEMPERATURE } from './climate'

/** A home's heat loss and heat pump figures, as the API stores them. */
export interface HeatPumpData {
  /** Where the figures came from. "sample" means made up, for development; "owner" means typed
   *  in by the home's owner when sharing. */
  source: 'sample' | 'heatpumpmonitor' | 'survey' | 'owner' | string
  designHeatLossW: number
  /** The outdoor temperature the heat loss was calculated at. Owners may not know it. */
  designOutdoorTemperature?: number
  designIndoorTemperature?: number
  /** Whether the heat loss was measured from a running system or calculated in a survey. */
  heatLossBasis?: 'measured' | 'survey'
  heatPump?: { make: string; model: string; capacityKw: number }
  annual?: { heatDeliveredKwh: number; electricityKwh: number; scop: number }
  designFlowTemperature?: number
  emitters?: 'radiators' | 'underfloor' | 'mixed' | string
}

export function isHeatPumpData(value: unknown): value is HeatPumpData {
  const d = value as HeatPumpData
  return typeof d === 'object' && d !== null && typeof d.source === 'string' && typeof d.designHeatLossW === 'number'
}

export interface Estimate {
  /** How many matches it's based on. */
  basedOn: number
  heatLossKw: [number, number]
  heatPumpKw: [number, number] | null
  scop: [number, number] | null
  annualHeatKwh: [number, number] | null
  sample: boolean
  /** The outdoor temperature the heat loss is for (your area's), or null when the figures are
   *  as quoted because the temperatures weren't known. */
  designTemperature: number | null
}

export interface EstimateMatch {
  score: number
  floorArea: number
  heatPump: HeatPumpData | null
  /** Their area's design temperature, for figures that don't say what they were quoted at. */
  designTemperature?: number | null
}

/** Matches at least this good inform the estimate. */
export const ESTIMATE_MIN_SCORE = 60
const ESTIMATE_MAX_HOMES = 5

const range = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)]

/**
 * A match's heat loss for your home. Heat losses are quoted for a design outdoor temperature,
 * which is colder in some places than others, so where both are known the heat loss is turned
 * into watts per degree and back out at your area's design temperature. Otherwise it's as quoted.
 */
function heatLossW(match: EstimateMatch, yourDesignTemperature: number | null): { watts: number; rescaled: boolean } {
  const data = match.heatPump!
  const outdoor = data.designOutdoorTemperature ?? match.designTemperature ?? null
  const indoor = data.designIndoorTemperature ?? DEFAULT_INDOOR_TEMPERATURE
  if (yourDesignTemperature === null || outdoor === null || indoor <= outdoor) return { watts: data.designHeatLossW, rescaled: false }
  const wattsPerKelvin = data.designHeatLossW / (indoor - outdoor)
  return { watts: wattsPerKelvin * (DEFAULT_INDOOR_TEMPERATURE - yourDesignTemperature), rescaled: true }
}

/**
 * What your home might need, going by its closest matches: their heat loss (at your area's
 * design temperature, when known) and heat use per m² scaled to your floor area, and their heat
 * pumps' sizes and efficiency as they are. A range from real homes, not a heat loss calculation.
 */
export function estimateFor(
  yourFloorArea: number,
  matches: EstimateMatch[],
  yourDesignTemperature: number | null = null,
): Estimate | null {
  const close = matches
    .filter((m) => m.score >= ESTIMATE_MIN_SCORE && m.heatPump && m.floorArea > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, ESTIMATE_MAX_HOMES)
  if (!close.length) return null

  const scale = (m: (typeof close)[number]) => yourFloorArea / m.floorArea
  const withAnnual = close.filter((m) => m.heatPump!.annual)
  const withHeatPump = close.filter((m) => m.heatPump!.heatPump)
  const heatLosses = close.map((m) => heatLossW(m, yourDesignTemperature))
  return {
    basedOn: close.length,
    heatLossKw: range(close.map((m, i) => (heatLosses[i].watts / 1000) * scale(m))),
    heatPumpKw: withHeatPump.length ? range(withHeatPump.map((m) => m.heatPump!.heatPump!.capacityKw)) : null,
    scop: withAnnual.length ? range(withAnnual.map((m) => m.heatPump!.annual!.scop)) : null,
    annualHeatKwh: withAnnual.length ? range(withAnnual.map((m) => m.heatPump!.annual!.heatDeliveredKwh * scale(m))) : null,
    sample: close.some((m) => m.heatPump!.source === 'sample'),
    designTemperature: heatLosses.some((h) => h.rescaled) ? yourDesignTemperature : null,
  }
}

/** With a proper minus sign, e.g. "−2 °C". */
export const formatTemperature = (celsius: number) => `${celsius < 0 ? '−' : ''}${Math.abs(celsius)} °C`
export const formatKw = (w: number) => `${(w / 1000).toFixed(1)} kW`
/** To the nearest 100 kWh: the figures aren't more precise than that. */
export const formatKwh = (kwh: number) => `${(Math.round(kwh / 100) * 100).toLocaleString('en-GB')} kWh`
export const formatRange = ([low, high]: [number, number], format: (v: number) => string) => {
  const a = format(low)
  const b = format(high)
  return a === b ? a : `${a} – ${b}`
}
