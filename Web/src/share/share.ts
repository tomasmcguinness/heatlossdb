import { create } from 'zustand'
import { surveyIdFromPath } from '../components/files'
import { useFabric } from '../fabric/store'
import type { HeatPumpData } from '../match/heatPump'

/**
 * A home the user has shared. It's listed in search once they've confirmed their email address,
 * which happens away from the website (a link in Clerk's email), so until then it's pending.
 */
export interface SharedHome {
  status: 'pending'
  email: string
  /** What the home is listed under, such as "Detached, 1945–64, insulated home". */
  name: string
  sharedAt: string
}

// Kept apart from the scan's edits, so the email address never goes into a saved file.
const shareKey = (hash: string) => `heatlossdb.share.${hash}`

export function readShare(hash: string): SharedHome | null {
  try {
    const value = localStorage.getItem(shareKey(hash))
    const share = value ? (JSON.parse(value) as SharedHome) : null
    return share?.status === 'pending' && typeof share.email === 'string' ? share : null
  } catch {
    return null
  }
}

function writeShare(hash: string, share: SharedHome) {
  try {
    localStorage.setItem(shareKey(hash), JSON.stringify(share))
  } catch {
    // Storage can be full or blocked; the share still went through.
  }
}

/** Shares made in this session, so the page updates without re-reading storage. */
const useShares = create<{ shares: Record<string, SharedHome> }>(() => ({ shares: {} }))

/** The open scan's share, if it has been shared from this browser. */
export function useShare(): SharedHome | null {
  const hash = useFabric((s) => s.scan?.hash)
  const made = useShares((s) => (hash ? s.shares[hash] : undefined))
  return hash ? (made ?? readShare(hash)) : null
}

export function saveShare(hash: string, share: SharedHome) {
  writeShare(hash, share)
  useShares.setState((s) => ({ shares: { ...s.shares, [hash]: share } }))
}

/** Creates the user's account. Clerk then emails them a link to confirm their address. */
export async function createAccount(email: string): Promise<void> {
  // TODO: Clerk. signUp.create({ emailAddress: email }), then
  // signUp.prepareEmailAddressVerification({ strategy: 'email_link', redirectUrl }).
  void email
}

/** Sends the scan, its edits, its listing name and any heat pump figures to HeatLossDB, to be
 *  listed once confirmed. */
export async function submitShare(name: string, heatPump: HeatPumpData | null): Promise<void> {
  // TODO: API. Upload the scan with its edits (as Save writes them) if it isn't uploaded yet, then
  // store the listing name against the survey with the status "pending" until Clerk confirms the
  // account's email address.
  void name
  // Scans opened from the app's link are uploaded already, so their figures can be saved now.
  const surveyId = surveyIdFromPath(location.pathname)
  if (heatPump && surveyId) await saveHeatPump(surveyId, heatPump)
}

export async function saveHeatPump(surveyId: string, heatPump: HeatPumpData): Promise<void> {
  const response = await fetch(`/api/surveys/${surveyId}/heat-pump`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(heatPump),
  })
  if (!response.ok) throw new Error(`Saving the heat pump figures failed: ${response.status}`)
}

/** Sends the confirmation email again. */
export async function resendConfirmation(email: string): Promise<void> {
  // TODO: Clerk. signUp.prepareEmailAddressVerification({ strategy: 'email_link', redirectUrl }).
  void email
}
