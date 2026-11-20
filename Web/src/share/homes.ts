import { create } from 'zustand'
import { authFetch, SignedOutError } from '../api'
import { surveyIdFromPath } from '../components/files'
import { editsChanged, isFabricDocument, useFabric, type FabricDocument } from '../fabric/store'
import { polygonArea } from '../scan/geometry'

/** A home in the user's account, as listed. */
export interface SavedHomeSummary {
  id: string
  name: string
  savedAt: string
}

/** What the home is listed under: the scan's file name, or how many rooms it has and its floor area. */
function homeName(): string {
  const { scan, scanName } = useFabric.getState()
  const file = scanName?.replace(/\.json$/i, '')
  if (file && !/^merged$/i.test(file)) return file.slice(0, 200)
  const rooms = scan?.rooms.length ?? 0
  const area = (scan?.outlines ?? []).flatMap((o) => o.closed).reduce((total, outline) => total + polygonArea(outline), 0)
  return `Home · ${rooms} ${rooms === 1 ? 'room' : 'rooms'} · ${Math.round(area)} m²`
}

/** Uploads the open scan (one opened from a file isn't on the server yet) and returns its id. */
async function uploadScan(): Promise<string> {
  const raw = useFabric.getState().scan?.raw
  if (!raw) throw new Error('Open your scan file again to save it.')
  const response = await fetch('/api/surveys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...raw, edits: undefined }),
  })
  if (!response.ok) throw new Error(`Uploading the scan failed: ${response.status}`)
  return ((await response.json()) as { id: string }).id
}

/**
 * Saves the open scan's edits to the signed-in user's account. A scan opened from a file is
 * uploaded first, and the address becomes its survey link, so reloading opens the saved home.
 * From then on the account holds the scan's edits: they're saved as they're made (see autosave
 * below), and the tab keeps no copy.
 */
export async function saveToAccount(): Promise<void> {
  const edits = useFabric.getState().exportFabric()
  if (!edits) return
  let id = surveyIdFromPath(location.pathname)
  if (!id) {
    id = await uploadScan()
    history.replaceState(null, '', `/s/${id}`)
  }
  const response = await authFetch(`/api/me/homes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: homeName(), edits }),
  })
  if (!response.ok) throw new Error(`Saving failed: ${response.status}`)
  if (useFabric.getState().exportFabric()?.scanHash === edits.scanHash) useFabric.getState().setInAccount(true)
}

/** Save, for someone who has only just signed in: if their account already has this survey,
 *  what's there is brought back (see App's useSavedEdits) rather than replaced with this tab's. */
export async function saveAfterSigningIn(): Promise<void> {
  const id = surveyIdFromPath(location.pathname)
  if (id && (await loadSavedEdits(id)) !== null) return
  await saveToAccount()
}

// MARK: - Autosave

export type AutosaveState = { state: 'saved' | 'pending' | 'saving' } | { state: 'failed'; message: string }

/** How the edits to a scan in the account are getting on: saved, waiting, saving, or failed. */
export const useAutosave = create<AutosaveState>(() => ({ state: 'saved' }))

/** How long after the last edit it's saved (ms), so a burst of changes is one save. */
const AUTOSAVE_DELAY = 1500

let timer: ReturnType<typeof setTimeout> | undefined
let saving = false
let again = false

/** Saves the edits now; if a save is already under way, once more after it. */
async function autosaveNow(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  if (saving) {
    again = true
    return
  }
  saving = true
  useAutosave.setState({ state: 'saving' })
  try {
    await saveToAccount()
    useAutosave.setState({ state: again || timer !== undefined ? 'pending' : 'saved' })
  } catch (e) {
    useAutosave.setState({
      state: 'failed',
      message: e instanceof SignedOutError ? 'Sign in again to save your changes' : 'Your latest changes aren’t saved',
    })
  } finally {
    saving = false
  }
  if (again) {
    again = false
    void autosaveNow()
  }
}

/** Tries a failed save again. */
export const retryAutosave = () => void autosaveNow()

// Edits to a scan in the account go to the account, a moment after they're made. Becoming one
// isn't itself an edit: Save has just saved them.
useFabric.subscribe((state, previous) => {
  if (!state.inAccount || !previous.inAccount || !editsChanged(state, previous)) return
  useAutosave.setState({ state: 'pending' })
  clearTimeout(timer)
  timer = setTimeout(() => void autosaveNow(), AUTOSAVE_DELAY)
})

// Leaving with changes not yet saved asks first, as the tab keeps no copy of them.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (useFabric.getState().inAccount && useAutosave.getState().state !== 'saved') e.preventDefault()
  })
}

/** The user's saved homes, most recently saved first. */
export async function listHomes(): Promise<SavedHomeSummary[]> {
  const response = await authFetch('/api/me/homes')
  if (!response.ok) throw new Error(`Listing your scans failed: ${response.status}`)
  return (await response.json()) as SavedHomeSummary[]
}

/** The user's saved copy of a survey, or null if they haven't saved it. Its edits are null if
 *  they can't be read. */
export async function loadSavedEdits(surveyId: string): Promise<{ edits: FabricDocument | null } | null> {
  const response = await authFetch(`/api/me/homes/${surveyId}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Opening your saved home failed: ${response.status}`)
  const { edits } = (await response.json()) as { edits: unknown }
  return { edits: isFabricDocument(edits) ? edits : null }
}
