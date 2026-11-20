import { useEffect, useRef, useState } from 'react'
import { AccountButton } from './components/AccountButton'
import { Brand } from './components/Brand'
import { DropZone } from './components/DropZone'
import { ExplorePage } from './components/ExplorePage'
import { MatchesPage } from './components/MatchesPage'
import { MyHomesPage } from './components/MyHomesPage'
import { SharedHomePage } from './components/SharedHomePage'
import { useAccount } from './components/useAccount'
import { loadSavedEdits } from './share/homes'
import { shareIdFromPath } from './share/sharedHome'
import { ScanEditor } from './components/editor/ScanEditor'
import { HomeFabricDialog } from './components/fabric/HomeFabricDialog'
import { errorMessage, loadDevScan, loadSurvey, surveyIdFromPath } from './components/files'
import { isHomeFabricSet } from './fabric/home'
import { restoreLastScan, useFabric } from './fabric/store'
import { useProfile } from './match/useProfile'

/** The floor plan editor, or one of the pages opened from its menu. */
type Page = 'scan' | 'matches' | 'explore'

/** Once a survey is open and the user is signed in, brings back the edits they saved to their
 *  account for it. Those replace this tab's, as opening a downloaded file's do. */
function useSavedEdits(surveyId: string | null, ready: boolean) {
  const { isSignedIn } = useAccount()
  // Once per home: switching to another version of its floor plan carries this tab's edits across,
  // which bringing back older saved ones would undo.
  const homeKey = useFabric((s) => s.homeKey)
  const loaded = useRef<string | null>(null)

  useEffect(() => {
    if (!surveyId || !ready || !isSignedIn || !homeKey) return
    const key = `${surveyId}:${homeKey}`
    if (loaded.current === key) return
    loaded.current = key
    const hash = useFabric.getState().scan?.hash
    loadSavedEdits(surveyId)
      .then((edits) => {
        if (edits && useFabric.getState().scan?.hash === hash) useFabric.getState().importFabric(edits)
      })
      // Without them the survey still opens, with this tab's edits.
      .catch(() => {})
  }, [surveyId, ready, isSignedIn, homeKey])
}

/** A shared home's link (/h/<id>) opens it to look at; every other page is the app itself. */
export default function App() {
  const [shareId] = useState(() => shareIdFromPath(location.pathname))
  return shareId ? <SharedHomePage shareId={shareId} /> : <ScanApp />
}

function ScanApp() {
  const scan = useFabric((s) => s.scan)
  const [error, setError] = useState<string | null>(null)
  const [onHomes] = useState(() => /^\/scans\/?$/.test(location.pathname))
  // /new is the page to open a scan: it starts empty rather than bringing back the last scan, which
  // stays in this tab's storage until another is opened.
  const [onNew] = useState(() => /^\/new\/?$/.test(location.pathname))
  // A link from the app (/s/<id>) opens that survey rather than the last one.
  const [surveyId] = useState(() => surveyIdFromPath(location.pathname))
  const [loadingSurvey, setLoadingSurvey] = useState(surveyId !== null)
  useSavedEdits(surveyId, !loadingSurvey)
  // Every newly opened home starts on its floor plan. The page is remembered per home (not per
  // floor plan: switching to its tidied plan stays where it is).
  const homeKey = useFabric((s) => s.homeKey)
  const [pageFor, setPageFor] = useState<{ home: string; page: Page } | null>(null)
  const page: Page = homeKey && pageFor?.home === homeKey ? pageFor.page : 'scan'
  const setPage = (p: Page) => homeKey && setPageFor({ home: homeKey, page: p })
  const profile = useProfile(surveyId)
  const editing = !onHomes && scan !== null && !loadingSurvey && page === 'scan'
  const [fabricOpen, setFabricOpen] = useState(false)
  const search = () => {
    setPage('matches')
    // Matching needs a few answers about the home first: its postcode, age and type.
    if (!isHomeFabricSet(useFabric.getState().home)) setFabricOpen(true)
  }

  useEffect(() => {
    if (onHomes) return
    if (surveyId) {
      loadSurvey(surveyId)
        .catch((e: unknown) => setError(errorMessage(e)))
        .finally(() => setLoadingSurvey(false))
      return
    }
    // Development only: ?scan=/fixtures/<file>.json opens a local scan, e.g. for screenshots.
    const params = new URLSearchParams(location.search)
    if (import.meta.env.DEV && params.has('scan')) {
      loadDevScan(params).catch((e: unknown) => setError(String(e)))
      return
    }
    if (onNew) return
    const last = restoreLastScan()
    if (last) useFabric.getState().loadScan(last)
  }, [surveyId, onHomes, onNew])

  // Once a scan is opened from /new, the address goes back to /, so a reload keeps it open.
  useEffect(() => {
    if (scan && /^\/new\/?$/.test(location.pathname)) history.replaceState(null, '', '/')
  }, [scan])

  return (
    <div className={editing ? 'app full' : 'app'}>
      {/* The editor has a header of its own. */}
      {!editing && (
        <header className="topbar">
          <h1 className="topbar-brand">
            <Brand size={28} />
          </h1>
          <AccountButton />
        </header>
      )}

      {onHomes ? (
        <MyHomesPage />
      ) : loadingSurvey ? (
        <div className="dropzone">
          <p className="muted">Opening survey…</p>
        </div>
      ) : !scan ? (
        <DropZone error={error} onError={setError} />
      ) : page === 'matches' ? (
        profile ? (
          <MatchesPage surveyId={surveyId} profile={profile} onBack={() => setPage('scan')} onFabric={() => setFabricOpen(true)} />
        ) : (
          <div className="dropzone">
            <p className="muted">This scan has no floor outline to match yet.</p>
          </div>
        )
      ) : page === 'explore' ? (
        <ExplorePage surveyId={surveyId} onBack={() => setPage('scan')} />
      ) : (
        <ScanEditor onSearch={search} onExplore={() => setPage('explore')} />
      )}

      {fabricOpen && scan && !editing && <HomeFabricDialog onClose={() => setFabricOpen(false)} />}
    </div>
  )
}
