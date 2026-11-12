import type { ElementSettings, HomeFabric } from './store'

/** One answer to a Home fabric question. */
export interface Choice {
  value: string
  label: string
}

export const NOT_SURE = 'not-sure'

const notSure: Choice = { value: NOT_SURE, label: 'Not sure' }

// The questions and answers from the Home fabric design (design/HomeFabric.dc.html): broad,
// whole-home answers in plain language. Differences are set later, element by element.

export const PROPERTY_TYPES: Choice[] = [
  { value: 'detached', label: 'Detached' },
  { value: 'semi-detached', label: 'Semi-detached' },
  { value: 'terraced', label: 'Terraced' },
]

export const AGE_BANDS: Choice[] = [
  { value: 'pre-1919', label: 'Before 1919' },
  { value: '1919-1944', label: '1919–1944' },
  { value: '1945-1964', label: '1945–1964' },
  { value: '1965-1982', label: '1965–1982' },
  { value: '1983-2002', label: '1983–2002' },
  { value: '2003-', label: '2003 or later' },
  notSure,
]

export const WALLS: Choice[] = [
  { value: 'solid', label: 'Solid brick or stone' },
  { value: 'cavity-unfilled', label: 'Cavity, not filled' },
  { value: 'cavity-filled', label: 'Cavity, filled' },
  { value: 'timber-frame', label: 'Timber frame' },
  notSure,
]

export const LOFTS: Choice[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'none', label: 'No loft (flat roof or room in roof)' },
  notSure,
]

/** Asked when the loft is insulated: whether it's above the joists, i.e. about 200 mm or more
 *  rather than 100 mm or less. Below 100 mm matters most for heat loss. */
export const LOFT_DEPTHS: Choice[] = [
  { value: 'below', label: 'No, level or below' },
  { value: 'above', label: 'Yes, well above' },
  notSure,
]

/** Skylights are assumed to match. */
export const WINDOWS: Choice[] = [
  { value: 'single', label: 'Single glazed' },
  { value: 'double-older', label: 'Double, older' },
  { value: 'double', label: 'Double, 2002 or newer' },
  { value: 'triple', label: 'Triple glazed' },
  notSure,
]

export const DOORS: Choice[] = [
  { value: 'solid-wood', label: 'Solid wood' },
  { value: 'part-glass', label: 'Part glass' },
  { value: 'composite', label: 'Modern composite or uPVC' },
  notSure,
]

export const FLOOR_TYPES: Choice[] = [
  { value: 'suspended-timber', label: 'Wooden floorboards' },
  { value: 'solid', label: 'Solid concrete' },
  notSure,
]

export const FLOOR_INSULATION: Choice[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  notSure,
]

/** The answer's label, or undefined if it isn't one of the choices. */
export function labelIn(choices: Choice[], value: string | undefined): string | undefined {
  return choices.find((c) => c.value === value)?.label
}

/** The main questions, as counted in "x of 7 answered". Follow-ups (loft depth, floor
 *  insulation) aren't counted. */
const MAIN_QUESTIONS: [keyof HomeFabric, Choice[]][] = [
  ['propertyType', PROPERTY_TYPES],
  ['ageBand', AGE_BANDS],
  ['walls', WALLS],
  ['loft', LOFTS],
  ['windows', WINDOWS],
  ['doors', DOORS],
  ['floorType', FLOOR_TYPES],
]

export const QUESTION_COUNT = MAIN_QUESTIONS.length

export function answeredCount(home: HomeFabric): number {
  return MAIN_QUESTIONS.filter(([key, choices]) => labelIn(choices, home[key] as string | undefined)).length
}

/** Whether the user has applied Home fabric. Anything left blank uses typical values for the
 *  home's age, so an applied fabric counts as set however many questions were answered. */
export const isHomeFabricSet = (home: HomeFabric) => home.applied === true

/** Elements the user has given their own fabric details or U-value, which applying Home fabric
 *  replaces. Roles (external, party, internal) aren't fabric, so they're kept. */
export const hasCustomFabric = (settings: ElementSettings) =>
  Object.keys(settings.fields ?? {}).length > 0 || settings.uValue !== undefined
