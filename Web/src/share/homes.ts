import { authFetch } from '../api'
import { surveyIdFromPath } from '../components/files'
import { isFabricDocument, useFabric, type FabricDocument } from '../fabric/store'
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
}

/** The user's saved homes, most recently saved first. */
export async function listHomes(): Promise<SavedHomeSummary[]> {
  const response = await authFetch('/api/me/homes')
  if (!response.ok) throw new Error(`Listing your homes failed: ${response.status}`)
  return (await response.json()) as SavedHomeSummary[]
}

/** The edits the user saved for a survey, or null if they haven't saved it. */
export async function loadSavedEdits(surveyId: string): Promise<FabricDocument | null> {
  const response = await authFetch(`/api/me/homes/${surveyId}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Opening your saved home failed: ${response.status}`)
  const { edits } = (await response.json()) as { edits: unknown }
  return isFabricDocument(edits) ? edits : null
}
