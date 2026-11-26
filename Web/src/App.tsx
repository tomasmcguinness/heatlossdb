import { useEffect, useRef, useState } from 'react'
import { adminSurveyIdFromPath } from './admin/admin'
import { AccountButton } from './components/AccountButton'
import { AdminPage } from './components/AdminPage'
import { AdminSurveyPage } from './components/AdminSurveyPage'
import { Brand } from './components/Brand'
import { ExplorePage } from './components/ExplorePage'
import { LandingPage } from './components/LandingPage'
import { ScanHub, type HubTab } from './components/hub/ScanHub'
import { MatchesPage } from './components/MatchesPage'
import { MyHomesPage } from './components/MyHomesPage'
import { SharedHomePage } from './components/SharedHomePage'
import { useAccount } from './components/useAccount'
import { loadSavedEdits } from './share/homes'
import { shareIdFromPath } from './share/sharedHome'
import { HomeFabricDialog } from './components/fabric/HomeFabricDialog'
import { errorMessage, loadDevScan, loadSurvey, surveyIdFromPath } from './components/files'
import { isHomeFabricSet } from './fabric/home'
import { restoreLastScan, useFabric } from './fabric/store'
import { useProfile } from './match/useProfile'

/** The scan hub (with the floor plan editor), or a page opened from it. */
type Page = 'hub' | 'matches' | 'explore'

/** Once a survey is open and the user is signed in, brings back the edits they saved to their
 *  account for it. Those replace this tab's, as opening a downloaded file's do, and from then on
 *  the account keeps them (see share/homes). */
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
      .then((saved) => {
        if (!saved || useFabric.getState().scan?.hash !== hash) return
        if (saved.edits) useFabric.getState().importFabric(saved.edits)
        useFabric.getState().setInAccount(true)
      })
      // Without them the survey still opens, with this tab's edits.
      .catch(() => {})
  }, [surveyId, ready, isSignedIn, homeKey])
}

/** A shared home's link (/h/<id>) opens it to look at, as does an admin's survey link
 *  (/admin/s/<id>); every other page is the app itself. */
export default function App() {
  const [shareId] = useState(() => shareIdFromPath(location.pathname))
  const [adminSurveyId] = useState(() => adminSurveyIdFromPath(location.pathname))
  if (shareId) return <SharedHomePage shareId={shareId} />
  if (adminSurveyId) return <AdminSurveyPage surveyId={adminSurveyId} />
  return <ScanApp />
}

function ScanApp() {
  const scan = useFabric((s) => s.scan)
  const [error, setError] = useState<string | null>(null)
  const [onHomes] = useState(() => /^\/scans\/?$/.test(location.pathname))
  // The Admin portal's list of every survey (admins only; see AdminPage).
  const [onAdmin] = useState(() => /^\/admin\/?$/.test(location.pathname))
  // /new is the page to open a scan: it starts empty rather than bringing back the last scan, which
  // stays in this tab's storage until another is opened.
  const [onNew] = useState(() => /^\/new\/?$/.test(location.pathname))
  // Explore the database, from the landing page: no scan needed.
  const [onExplore] = useState(() => /^\/explore\/?$/.test(location.pathname))
  // A link from the app (/s/<id>) opens that survey rather than the last one.
  const [surveyId] = useState(() => surveyIdFromPath(location.pathname))
  const [loadingSurvey, setLoadingSurvey] = useState(surveyId !== null)
  useSavedEdits(surveyId, !loadingSurvey)
  // Every newly opened home starts on the scan hub. The page is remembered per home (not per floor
  // plan: switching to its tidied plan stays where it is).
  const homeKey = useFabric((s) => s.homeKey)
  const [pageFor, setPageFor] = useState<{ home: string; page: Page } | null>(null)
  const page: Page = homeKey && pageFor?.home === homeKey ? pageFor.page : 'hub'
  const setPage = (p: Page) => homeKey && setPageFor({ home: homeKey, page: p })
  const profile = useProfile(surveyId)
  // The hub has a header of its own, and the editor's Home fabric.
  const inHub = !onHomes && !onAdmin && scan !== null && !loadingSurvey && page === 'hub'
  const [fabricOpen, setFabricOpen] = useState(false)
  // The hub's tab, kept while Matches or Explore is open so Back returns to it.
  const [hubTab, setHubTab] = useState<HubTab>('view')
  const search = () => {
    setPage('matches')
    // Matching needs a few answers about the home first: its postcode, age and type.
    if (!isHomeFabricSet(useFabric.getState().home)) setFabricOpen(true)
  }

  useEffect(() => {
    if (onHomes || onAdmin || onExplore) return
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
  }, [surveyId, onHomes, onAdmin, onNew, onExplore])

  // Once a scan is opened from /new, the address goes back to /, so a reload keeps it open.
  useEffect(() => {
    if (scan && /^\/new\/?$/.test(location.pathname)) history.replaceState(null, '', '/')
  }, [scan])

  return (
    <div className={inHub ? 'app full' : 'app'}>
      {!inHub && (
        <header className="topbar">
          <h1 className="topbar-brand">
            <Brand size={28} />
          </h1>
          <AccountButton />
        </header>
      )}

      {onHomes ? (
        <MyHomesPage />
      ) : onAdmin ? (
        <AdminPage />
      ) : onExplore ? (
        <ExplorePage surveyId={null} onBack={() => location.assign('/new')} />
      ) : loadingSurvey ? (
        <div className="dropzone">
          <p className="muted">Opening survey…</p>
        </div>
      ) : !scan ? (
        <LandingPage error={error} onError={setError} />
      ) : page === 'matches' ? (
        profile ? (
          <MatchesPage surveyId={surveyId} profile={profile} onBack={() => setPage('hub')} onFabric={() => setFabricOpen(true)} />
        ) : (
          <div className="dropzone">
            <p className="muted">This scan has no floor outline to match yet.</p>
          </div>
        )
      ) : page === 'explore' ? (
        <ExplorePage surveyId={surveyId} onBack={() => setPage('hub')} />
      ) : (
        <ScanHub tab={hubTab} onTab={setHubTab} onSearch={search} onExplore={() => setPage('explore')} />
      )}

      {fabricOpen && scan && !inHub && <HomeFabricDialog onClose={() => setFabricOpen(false)} />}
    </div>
  )
}
