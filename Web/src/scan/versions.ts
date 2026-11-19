import { fetchAsUser } from '../api'
import { parseScan, ScanParseError } from './parse'
import type { Scan } from './types'

/** A survey's floor plan: the scan as uploaded, or its tidy once accepted. */
export type FloorplanVersionId = 'original' | 'tidied'

export interface FloorplanVersion {
  id: FloorplanVersionId
  /** When it was uploaded, or when the tidy was accepted (ISO 8601). */
  at: string
  tidierVersion: number | null
}

export interface FloorplanVersions {
  current: FloorplanVersionId
  versions: FloorplanVersion[]
}

/** What tidying found and did, as the API returns it (HeatLossDB.ScanTidy). */
export interface TidySummary {
  wallsBefore: number
  wallsAfter: number
  changes: number
  needsReview: number
  allRoomsClosed: boolean
  openRooms: string[]
}

export interface TidyChange {
  pass: string
  kind: string
  /** The RoomPlan storey, when the change is on one. */
  story: number | null
  message: string
  wallIds: string[]
  millimetres: number | null
  needsReview: boolean
}

export interface TidyResult {
  summary: TidySummary
  changes: TidyChange[]
}

/** The API's own message for a failed call, or the fallback. */
async function failure(response: Response, fallback: string): Promise<ScanParseError> {
  try {
    const { error } = (await response.json()) as { error?: unknown }
    if (typeof error === 'string' && error) return new ScanParseError(error)
  } catch {
    // Not JSON: use the fallback.
  }
  return new ScanParseError(fallback)
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchAsUser(url, init)
  } catch {
    throw new ScanParseError("Couldn't reach HeatLossDB. Check your connection and try again.")
  }
}

export async function floorplanVersions(surveyId: string): Promise<FloorplanVersions> {
  const response = await call(`/api/surveys/${surveyId}/versions`)
  if (!response.ok) throw await failure(response, "Couldn't load this home's floor plans.")
  return (await response.json()) as FloorplanVersions
}

/** Tidies the survey's scan on the server (always from the upload), as a preview to look at. */
export async function tidySurvey(surveyId: string): Promise<TidyResult> {
  const response = await call(`/api/surveys/${surveyId}/tidy`, { method: 'POST' })
  if (!response.ok) throw await failure(response, "Couldn't tidy this floor plan. Try again in a moment.")
  return (await response.json()) as TidyResult
}

async function loadScanFrom(url: string): Promise<Scan> {
  const response = await call(url)
  if (!response.ok) throw await failure(response, "Couldn't load the floor plan. Try again in a moment.")
  return parseScan(await response.json())
}

/** The latest tidy's preview. */
export const loadTidiedPreview = (surveyId: string) => loadScanFrom(`/api/surveys/${surveyId}/scan/tidied`)

/** The scan as uploaded. */
export const loadOriginal = (surveyId: string) => loadScanFrom(`/api/surveys/${surveyId}/scan`)

export interface CurrentPlan {
  versions: FloorplanVersions
  scan: Scan
}

async function changed(surveyId: string, response: Response): Promise<CurrentPlan> {
  if (!response.ok) throw await failure(response, "Couldn't change the floor plan. Try again in a moment.")
  const versions = (await response.json()) as FloorplanVersions
  return { versions, scan: await loadScanFrom(`/api/surveys/${surveyId}/scan/current`) }
}

/** Makes the latest tidy the survey's floor plan, and returns it. */
export async function acceptTidy(surveyId: string): Promise<CurrentPlan> {
  return changed(surveyId, await call(`/api/surveys/${surveyId}/tidy/accept`, { method: 'POST' }))
}

/** Switches to a version already kept (the upload, or the tidy accepted last), and returns it. */
export async function switchVersion(surveyId: string, version: FloorplanVersionId): Promise<CurrentPlan> {
  const response = await call(`/api/surveys/${surveyId}/versions/current`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
  return changed(surveyId, response)
}
