// Explore the database: filtering, sorting and summing up the homes others have shared.
import { climateFor } from './climate'
import type { Candidate } from './candidates'
import { outwardCode } from '../share/postcode'

/** Floor area bands (m²): from, up to but not including. */
export const AREA_BANDS = [
  { value: 'under-60', label: 'Under 60 m²', from: 0, to: 60 },
  { value: '60-90', label: '60–90 m²', from: 60, to: 90 },
  { value: '90-120', label: '90–120 m²', from: 90, to: 120 },
  { value: '120-160', label: '120–160 m²', from: 120, to: 160 },
  { value: 'over-160', label: 'Over 160 m²', from: 160, to: Infinity },
] as const

export interface ExploreFilters {
  /** A postcode area ("SW") or district ("SW1A"), already checked with searchArea. */
  area: string | null
  propertyTypes: string[]
  ageBands: string[]
  /** One of AREA_BANDS' values, or empty for any size. */
  floorArea: string
  hasHeatPump: boolean
  measured: boolean
  installerCalc: boolean
}

export const NO_FILTERS: ExploreFilters = {
  area: null,
  propertyTypes: [],
  ageBands: [],
  floorArea: '',
  hasHeatPump: false,
  measured: false,
  installerCalc: false,
}

/** "SW", "SW1A" or a full postcode as a search: that postcode area or district, or null if it's
 *  neither. */
export function searchArea(text: string): string | null {
  const typed = text.trim().toUpperCase()
  if (!typed) return null
  return outwardCode(typed) ?? (/^[A-Z]{1,2}$/.test(typed) ? typed : null)
}

/** Heat loss per square metre of floor (W/m²), when the home has figures. */
export const wattsPerM2 = (c: Candidate): number | null =>
  c.heatPump && c.profile.floorArea ? c.heatPump.designHeatLossW / c.profile.floorArea : null

/** The heat pump's measured SCOP, from a year of running it. */
export const measuredScop = (c: Candidate): number | null => c.heatPump?.annual?.scop ?? null

/** Whether the heat loss came from an installer's or surveyor's calculation. */
export const hasInstallerCalc = (c: Candidate): boolean => c.heatPump?.heatLossBasis === 'survey' || c.heatPump?.source === 'survey'

function inArea(c: Candidate, area: string): boolean {
  const district = c.share?.postcodeDistrict
  if (!district) return false
  return /\d/.test(area) ? district === area : climateFor(district)?.area === area
}

export function matchesFilters(c: Candidate, f: ExploreFilters): boolean {
  if (f.area && !inArea(c, f.area)) return false
  const home = c.share?.home
  if (f.propertyTypes.length && !f.propertyTypes.includes(home?.propertyType ?? '')) return false
  if (f.ageBands.length && !f.ageBands.includes(home?.ageBand ?? '')) return false
  const band = AREA_BANDS.find((b) => b.value === f.floorArea)
  if (band && !(c.profile.floorArea >= band.from && c.profile.floorArea < band.to)) return false
  if (f.hasHeatPump && !c.heatPump?.heatPump) return false
  if (f.measured && measuredScop(c) === null) return false
  if (f.installerCalc && !hasInstallerCalc(c)) return false
  return true
}

export type Sort = 'recent' | 'lowest' | 'highest' | 'scop'

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'lowest', label: 'Lowest heat loss per m²' },
  { value: 'highest', label: 'Highest heat loss per m²' },
  { value: 'scop', label: 'Best measured performance' },
]

/** Sorts by a figure, with homes that don't have it last. */
const byFigure = (value: (c: Candidate) => number | null, descending: boolean) => (a: Candidate, b: Candidate) => {
  const x = value(a)
  const y = value(b)
  if (x === null) return y === null ? 0 : 1
  if (y === null) return -1
  return descending ? y - x : x - y
}

export const SORTERS: Record<Sort, (a: Candidate, b: Candidate) => number> = {
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
  lowest: byFigure(wattsPerM2, false),
  highest: byFigure(wattsPerM2, true),
  scop: byFigure(measuredScop, true),
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const present = <T>(values: (T | null | undefined)[]): T[] => values.filter((v): v is T => v !== null && v !== undefined)

export interface ExploreTotals {
  homes: number
  medianWattsPerM2: number | null
  withHeatPump: number
  measured: number
}

export function totalsOf(homes: Candidate[]): ExploreTotals {
  return {
    homes: homes.length,
    medianWattsPerM2: median(present(homes.map(wattsPerM2))),
    withHeatPump: homes.filter((c) => c.heatPump?.heatPump).length,
    measured: homes.filter((c) => measuredScop(c) !== null).length,
  }
}

export interface AreaRow {
  district: string
  homes: number
  medianWattsPerM2: number | null
  /** The median size of the heat pumps fitted (kW). */
  typicalHeatPumpKw: number | null
}

/** The homes by postcode district, most homes first. Homes without a district are left out. */
export function byArea(homes: Candidate[]): AreaRow[] {
  const groups = new Map<string, Candidate[]>()
  for (const c of homes) {
    const district = c.share?.postcodeDistrict
    if (!district) continue
    groups.set(district, [...(groups.get(district) ?? []), c])
  }
  return [...groups.entries()]
    .map(([district, list]) => ({
      district,
      homes: list.length,
      medianWattsPerM2: median(present(list.map(wattsPerM2))),
      typicalHeatPumpKw: median(present(list.map((c) => c.heatPump?.heatPump?.capacityKw))),
    }))
    .sort((a, b) => b.homes - a.homes || a.district.localeCompare(b.district))
}
