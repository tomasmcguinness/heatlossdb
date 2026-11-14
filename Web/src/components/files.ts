import { hasEdits, isFabricDocument, useFabric } from '../fabric/store'
import { HEATLOSSDB_VERSION, parseScan, ScanParseError } from '../scan/parse'

async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text())
  } catch {
    throw new ScanParseError(`${file.name} isn't a valid JSON file.`)
  }
}

/** Loads a dropped or chosen file: a scan (merged.json), a scan saved with its edits, or exported
 *  fabric settings. */
export async function openFile(file: File): Promise<void> {
  const json = await readJson(file)
  const store = useFabric.getState()

  if (isFabricDocument(json)) {
    if (!store.scan) throw new ScanParseError('Open the scan first, then import its fabric settings.')
    if (
      json.scanHash !== store.scan.hash &&
      !window.confirm('These settings were exported from a different scan. Import the ones that match this scan?')
    ) {
      return
    }
    store.importFabric(json)
    return
  }

  store.loadScan(parseScan(json), file.name)
  // A file from Save carries its edits, which replace any kept in this tab.
  const edits = (json as { edits?: unknown }).edits
  if (isFabricDocument(edits)) store.importFabric(edits)
}

/** Closes the open scan and forgets it in this tab, after warning that any changes will be
 *  lost. Leaves a survey link too, so a reload doesn't reopen it. */
export function closeScan() {
  const store = useFabric.getState()
  if (
    hasEdits(store) &&
    !window.confirm('Your changes to this scan will be lost. To keep them, cancel and save the home first.')
  ) {
    return
  }
  store.closeScan()
  if (location.pathname !== '/') history.replaceState(null, '', '/')
}

export function downloadFabric() {
  const doc = useFabric.getState().exportFabric()
  if (!doc) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `fabric-${doc.scanHash}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Downloads the scan with the user's edits, as one file that opens on its own. */
export function downloadHome() {
  const { scan, exportFabric } = useFabric.getState()
  const edits = exportFabric()
  if (!scan?.raw || !edits) return
  const file = { ...scan.raw, heatlossdbVersion: HEATLOSSDB_VERSION, edits }
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `home-${scan.hash}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function errorMessage(error: unknown): string {
  return error instanceof ScanParseError ? error.message : "Couldn't open that file."
}

/**
 * Development only: opens ?scan=<url>, then applies ?select=<element id or index:N>,
 * ?tab=<tab> and ?view=spread,ceilings,external,hide:<storey>. Used for screenshots in tests.
 */
export async function loadDevScan(params: URLSearchParams): Promise<void> {
  const response = await fetch(params.get('scan')!)
  const store = useFabric.getState()
  store.loadScan(parseScan(await response.json()))

  const view = (params.get('view') ?? '').split(',').filter(Boolean)
  if (view.includes('plan')) store.resetView('plan')
  store.setView({
    spreadStoreys: view.includes('spread'),
    showCeilings: view.includes('ceilings'),
    externalOnly: view.includes('external'),
    showStorage: view.includes('storage'),
    hiddenStories: view.filter((v) => v.startsWith('hide:')).map((v) => Number(v.slice(5))),
  })

  const select = params.get('select')
  if (select) {
    const elements = useFabric.getState().scan!.elements
    const id = select.startsWith('index:') ? elements[Number(select.slice(6))]?.id : select
    if (id) store.select(id)
  }
  const tab = params.get('tab')
  if (tab === 'element' || tab === 'defaults' || tab === 'storeys' || tab === 'summary') store.setTab(tab)
}

/** The survey id in a link such as /s/AbC…, or null on any other page. */
export function surveyIdFromPath(pathname: string): string | null {
  return /^\/s\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname)?.[1] ?? null
}

/** The characters in an upload code: letters and digits that can't be mistaken for each other. */
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/

/** Tidies a typed upload code: upper case, without spaces or dashes. */
export function normaliseCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}

/** The survey id for an upload code shown in the app. Codes last a day after uploading. */
export async function surveyIdForCode(code: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`/api/codes/${encodeURIComponent(code)}`)
  } catch {
    throw new ScanParseError("Couldn't reach HeatLossDB. Check your connection and try again.")
  }
  if (response.status === 404) {
    throw new ScanParseError("That code isn't right, or it has expired. Codes last a day; upload again from the app for a new one.")
  }
  if (response.status === 429) throw new ScanParseError('Too many tries. Wait a minute, then try again.')
  if (!response.ok) throw new ScanParseError("Couldn't check that code. Try again in a moment.")
  return ((await response.json()) as { id: string }).id
}

/** Opens a survey uploaded from the app, as linked from the app after uploading. */
export async function loadSurvey(id: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/surveys/${id}/scan`)
  } catch {
    throw new ScanParseError("Couldn't reach HeatLossDB. Check your connection and try again.")
  }
  if (response.status === 404) {
    throw new ScanParseError("This survey link isn't valid, or the survey has been removed.")
  }
  if (!response.ok) throw new ScanParseError("Couldn't load this survey. Try again in a moment.")
  useFabric.getState().loadScan(parseScan(await response.json()))
}
