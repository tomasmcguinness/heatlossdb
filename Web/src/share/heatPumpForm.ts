import type { HeatPumpData } from '../match/heatPump'

/** What the owner types into Share your home's heat pump step. Every field is optional. */
export interface HeatPumpForm {
  /** Make and model as one, such as "Mitsubishi Ecodan 8.5". */
  makeAndModel: string
  outputKw: string
  heatLossKw: string
  flowTemperature: string
}

export const EMPTY_HEAT_PUMP_FORM: HeatPumpForm = { makeAndModel: '', outputKw: '', heatLossKw: '', flowTemperature: '' }

export const isHeatPumpFormEmpty = (form: HeatPumpForm) => Object.values(form).every((v) => v.trim() === '')

/** A number typed into the form, or undefined if blank. NaN if it isn't a number. */
function parse(value: string): number | undefined {
  const text = value.trim().replace(',', '.')
  return text === '' ? undefined : Number(text)
}

const within = (value: number | undefined, min: number, max: number) => value === undefined || (value >= min && value <= max)

/**
 * The figures to store for the home, or a message saying what to fix. The heat loss is what
 * matching uses, so the other figures can't be saved without it.
 */
export function heatPumpRecord(form: HeatPumpForm): { record: HeatPumpData } | { error: string } {
  const heatLossKw = parse(form.heatLossKw)
  const outputKw = parse(form.outputKw)
  const flowTemperature = parse(form.flowTemperature)
  const makeAndModel = form.makeAndModel.trim().replace(/\s+/g, ' ')

  if (heatLossKw === undefined) return { error: 'Add the calculated heat loss to save these figures, or skip this step.' }
  if (!within(heatLossKw, 0.5, 50)) return { error: 'Heat loss should be between 0.5 and 50 kW.' }
  if (!within(outputKw, 1, 50)) return { error: 'Rated output should be between 1 and 50 kW.' }
  if (!within(flowTemperature, 25, 80)) return { error: 'Flow temperature should be between 25 and 80 °C.' }
  if (outputKw !== undefined && !makeAndModel) return { error: 'Add the heat pump’s make and model, or clear its rated output.' }
  if (makeAndModel && outputKw === undefined) return { error: 'Add the heat pump’s rated output, or clear its make and model.' }

  const record: HeatPumpData = {
    source: 'owner',
    designHeatLossW: Math.round(heatLossKw * 1000),
    heatLossBasis: 'survey',
  }
  if (makeAndModel && outputKw !== undefined) {
    // The first word is near enough always the make: "Vaillant aroTHERM plus 7".
    const [make, ...model] = makeAndModel.split(' ')
    record.heatPump = { make, model: model.join(' '), capacityKw: outputKw }
  }
  if (flowTemperature !== undefined) record.designFlowTemperature = flowTemperature
  return { record }
}
