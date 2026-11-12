import { useEffect, useState } from 'react'
import type { HomeFabric } from '../fabric/store'
import { isHeatPumpData, type HeatPumpData } from './heatPump'
import { isShapeProfile, type ShapeProfile } from './profile'

/** Another home, as the API lists it for matching and browsing. */
interface RawCandidate {
  id: string
  createdAt: string
  profile: unknown
  heatPump?: unknown
  share?: unknown
}

/** What the owner said when sharing the home. */
export interface SharedDetails {
  name: string
  postcodeDistrict: string
  shareRoomNames: boolean
  home: HomeFabric | null
}

export interface Candidate {
  id: string
  createdAt: string
  profile: ShapeProfile
  heatPump: HeatPumpData | null
  /** Null for homes uploaded but not shared yet. */
  share: SharedDetails | null
}

function parseShare(value: unknown): SharedDetails | null {
  const s = value as Partial<SharedDetails> | null | undefined
  if (typeof s !== 'object' || s === null || typeof s.name !== 'string' || typeof s.postcodeDistrict !== 'string') return null
  return {
    name: s.name,
    postcodeDistrict: s.postcodeDistrict,
    shareRoomNames: s.shareRoomNames === true,
    home: typeof s.home === 'object' && s.home !== null ? s.home : null,
  }
}

/** The candidates worth using: those with a valid shape profile. */
export function parseCandidates(list: RawCandidate[]): Candidate[] {
  return list
    .filter((c) => isShapeProfile(c.profile))
    .map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      profile: c.profile as ShapeProfile,
      heatPump: isHeatPumpData(c.heatPump) ? c.heatPump : null,
      share: parseShare(c.share),
    }))
}

/** Every candidate except uploads of the open scan, which would otherwise match itself. */
export const otherHomes = (candidates: Candidate[], scanHash: string) => candidates.filter((c) => c.profile.scanHash !== scanHash)

export type CandidatesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; candidates: Candidate[] }

/**
 * Other homes, loaded from the API. For an uploaded survey the server leaves out the survey
 * itself; a scan opened from a file isn't on the server, so every home is listed, including any
 * upload of the same scan (see otherHomes).
 */
export function useCandidates(surveyId: string | null, reload = 0): CandidatesState {
  const request = `${surveyId ?? ''}#${reload}`
  const [fetched, setFetched] = useState<{ request: string; candidates: Candidate[] | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(surveyId ? `/api/surveys/${surveyId}/candidates` : '/api/candidates')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: RawCandidate[]) => !cancelled && setFetched({ request, candidates: parseCandidates(list) }))
      .catch(() => !cancelled && setFetched({ request, candidates: null }))
    return () => {
      cancelled = true
    }
  }, [surveyId, request])

  // A result for an earlier request is stale.
  if (fetched?.request !== request) return { status: 'loading' }
  return fetched.candidates ? { status: 'ready', candidates: fetched.candidates } : { status: 'error' }
}
