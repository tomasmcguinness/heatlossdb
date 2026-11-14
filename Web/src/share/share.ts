import { create } from 'zustand'
import { surveyIdFromPath } from '../components/files'
import { useFabric, type HomeFabric } from '../fabric/store'
import type { HeatPumpData } from '../match/heatPump'

/** A home the user has shared from this browser. Only signed-in users can share. */
export interface SharedHome {
  /** What the home is listed under, such as "Detached, 1945–64, insulated home". */
  name: string
  sharedAt: string
}

// Kept apart from the scan's edits, so a saved file doesn't say it was shared. Session storage, not
// local: it lasts while the tab is open, so a scan isn't stuck as shared for good.
const shareKey = (hash: string) => `heatlossdb.share.${hash}`

export function readShare(hash: string): SharedHome | null {
  try {
    const value = sessionStorage.getItem(shareKey(hash))
    const share = value ? (JSON.parse(value) as Partial<SharedHome>) : null
    return typeof share?.name === 'string' && typeof share.sharedAt === 'string' ? { name: share.name, sharedAt: share.sharedAt } : null
  } catch {
    return null
  }
}

function writeShare(hash: string, share: SharedHome) {
  try {
    sessionStorage.setItem(shareKey(hash), JSON.stringify(share))
  } catch {
    // Storage can be full or blocked; the share still went through.
  }
}

/** Shares made in this session, so the page updates without re-reading storage. */
const useShares = create<{ shares: Record<string, SharedHome> }>(() => ({ shares: {} }))

/** The open scan's share, if it has been shared from this tab. */
export function useShare(): SharedHome | null {
  const hash = useFabric((s) => s.scan?.hash)
  const made = useShares((s) => (hash ? s.shares[hash] : undefined))
  return hash ? (made ?? readShare(hash)) : null
}

export function saveShare(hash: string, share: SharedHome) {
  writeShare(hash, share)
  useShares.setState((s) => ({ shares: { ...s.shares, [hash]: share } }))
}

/** Where the home is and what the owner is happy to show, asked for when sharing. */
export interface ShareDetails {
  /** The first part of the postcode, such as "SW1A". The full postcode is never kept. */
  postcodeDistrict: string
  /** Whether others may see the room names. If not, rooms are shown as "Room 1", "Room 2"… */
  shareRoomNames: boolean
  /** The owner's answers about how the home is built, for matching on fabric. */
  home: HomeFabric
}

/** Sends the listing name, the share details and any heat pump figures to HeatLossDB, which
 *  lists the home in search straight away. */
export async function submitShare(name: string, details: ShareDetails, heatPump: HeatPumpData | null): Promise<void> {
  // TODO: API. Upload the scan with its edits (as Save writes them) if it isn't uploaded yet.
  // Scans opened from the app's link are uploaded already, so their details can be saved now.
  const surveyId = surveyIdFromPath(location.pathname)
  if (!surveyId) return
  await saveShareDetails(surveyId, name, details)
  if (heatPump) await saveHeatPump(surveyId, heatPump)
}

async function saveShareDetails(surveyId: string, name: string, details: ShareDetails): Promise<void> {
  // "applied" is the editor's own bookkeeping, not part of how the home is built.
  const { applied: _applied, ...home } = details.home
  const response = await fetch(`/api/surveys/${surveyId}/share`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...details, home }),
  })
  if (!response.ok) throw new Error(`Saving the share details failed: ${response.status}`)
}

export async function saveHeatPump(surveyId: string, heatPump: HeatPumpData): Promise<void> {
  const response = await fetch(`/api/surveys/${surveyId}/heat-pump`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(heatPump),
  })
  if (!response.ok) throw new Error(`Saving the heat pump figures failed: ${response.status}`)
}
