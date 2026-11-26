import { authFetch } from '../api'
import { isFabricDocument, type FabricDocument } from '../fabric/store'
import { isHeatPumpData } from '../match/heatPump'
import { parseScan } from '../scan/parse'
import type { SharedHome } from '../share/sharedHome'

/**
 * The Admin portal (/admin): every uploaded survey, each opening read-only at /admin/s/<id>. Only
 * accounts with { "isAdmin": true } in their Clerk public metadata can use it; the API checks.
 */

/** A survey in the admin list. */
export interface AdminSurveySummary {
  id: string
  createdAt: string
  sizeBytes: number
  /** Whether someone has saved it to their account. */
  owned: boolean
  isShared: boolean
  /** The owner's name for it, else its shared listing name, else null. */
  name: string | null
}

/** A survey opened from the Admin portal: the home as the shared view draws it, and when it was uploaded. */
export interface AdminSurvey {
  home: SharedHome
  createdAt: string
  owned: boolean
  /** Whether the owner's saved edits are shown (false: the scan as uploaded). */
  hasEdits: boolean
}

/** The survey id in a link such as /admin/s/AbC…, or null on any other page. */
export function adminSurveyIdFromPath(pathname: string): string | null {
  return /^\/admin\/s\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname)?.[1] ?? null
}

export async function listAllSurveys(): Promise<AdminSurveySummary[]> {
  const response = await authFetch('/api/admin/surveys')
  if (!response.ok) throw new AdminError(response.status)
  return (await response.json()) as AdminSurveySummary[]
}

/** Edits for a survey nobody has saved: the scan as uploaded. */
const noEdits = (): FabricDocument => ({
  format: 'heatlossdb.fabric',
  version: 1,
  scanHash: '',
  defaults: {} as FabricDocument['defaults'],
  elements: {},
})

/** Loads a survey to look at: its details and owner's edits, then its current floor plan. */
export async function loadAdminSurvey(id: string): Promise<AdminSurvey> {
  const [surveyResponse, scanResponse] = await Promise.all([authFetch(`/api/admin/surveys/${id}`), fetch(`/api/surveys/${id}/scan/current`)])
  if (!surveyResponse.ok) throw new AdminError(surveyResponse.status)
  if (!scanResponse.ok) throw new AdminError(scanResponse.status)
  const survey = (await surveyResponse.json()) as {
    name?: unknown
    createdAt?: unknown
    owned?: unknown
    postcodeDistrict?: unknown
    heatPump?: unknown
    edits?: unknown
  }
  if (typeof survey.createdAt !== 'string') throw new Error('This survey couldn’t be read.')
  const hasEdits = isFabricDocument(survey.edits)
  return {
    createdAt: survey.createdAt,
    owned: survey.owned === true,
    hasEdits,
    home: {
      name: typeof survey.name === 'string' && survey.name ? survey.name : `Survey ${id}`,
      sharedAt: survey.createdAt,
      postcodeDistrict: typeof survey.postcodeDistrict === 'string' ? survey.postcodeDistrict : null,
      heatPump: isHeatPumpData(survey.heatPump) ? survey.heatPump : null,
      scan: parseScan(await scanResponse.json()),
      edits: hasEdits ? (survey.edits as FabricDocument) : noEdits(),
    },
  }
}

/** A failed admin request, worded for its status. */
export class AdminError extends Error {
  readonly status: number

  constructor(status: number) {
    super(
      status === 403
        ? 'You don’t have access to the Admin portal.'
        : status === 404
          ? 'There’s no survey with this id.'
          : `Couldn’t load this (${status}). Try again in a moment.`,
    )
    this.status = status
  }
}
