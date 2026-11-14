import { useEffect, useRef, useState } from 'react'
import { AccountButton } from './components/AccountButton'
import { DropZone } from './components/DropZone'
import { ExplorePage } from './components/ExplorePage'
import { MatchesPage } from './components/MatchesPage'
import { MyHomesPage } from './components/MyHomesPage'
import { useAccount } from './components/useAccount'
import { loadSavedEdits } from './share/homes'
import { WhatNext, type Choice } from './components/WhatNext'
import { ScanEditor } from './components/editor/ScanEditor'
import { HomeFabricDialog } from './components/fabric/HomeFabricDialog'
import { errorMessage, loadDevScan, loadSurvey, surveyIdFromPath } from './components/files'
import { isHomeFabricSet } from './fabric/home'
import { restoreLastScan, useFabric } from './fabric/store'
import { useProfile } from './match/useProfile'

type Page = 'next' | 'scan' | 'share' | 'matches' | 'explore'

/** The page each What next choice opens. Sharing starts in the editor, with Share open. */
const PAGE_FOR: Record<Choice, Page> = { view: 'scan', share: 'share', search: 'matches', explore: 'explore' }

/** Once a survey is open and the user is signed in, brings back the edits they saved to their
 *  account for it. Those replace this tab's, as opening a downloaded file's do. */
function useSavedEdits(surveyId: string | null, ready: boolean) {
  const { isSignedIn } = useAccount()
  const hash = useFabric((s) => s.scan?.hash)
  const loaded = useRef<string | null>(null)

  useEffect(() => {
    if (!surveyId || !ready || !isSignedIn || !hash) return
    const key = `${surveyId}:${hash}`
    if (loaded.current === key) return
    loaded.current = key
    loadSavedEdits(surveyId)
      .then((edits) => {
        if (edits && useFabric.getState().scan?.hash === hash) useFabric.getState().importFabric(edits)
      })
      // Without them the survey still opens, with this tab's edits.
      .catch(() => {})
  }, [surveyId, ready, isSignedIn, hash])
}

export default function App() {
  const scan = useFabric((s) => s.scan)
  const [error, setError] = useState<string | null>(null)
  const [onHomes] = useState(() => /^\/scans\/?$/.test(location.pathname))
  // A link from the app (/s/<id>) opens that survey rather than the last one.
  const [surveyId] = useState(() => surveyIdFromPath(location.pathname))
  const [loadingSurvey, setLoadingSurvey] = useState(surveyId !== null)
  useSavedEdits(surveyId, !loadingSurvey)
  // Every newly opened scan starts on What next?, so the page is remembered per scan.
  const [pageFor, setPageFor] = useState<{ hash: string; page: Page } | null>(null)
  const page: Page = scan && pageFor?.hash === scan.hash ? pageFor.page : 'next'
  const setPage = (p: Page) => scan && setPageFor({ hash: scan.hash, page: p })
  const profile = useProfile(surveyId)
  const editing = !onHomes && scan !== null && !loadingSurvey && (page === 'scan' || page === 'share')
  const [fabricOpen, setFabricOpen] = useState(false)
  // Search can be opened from What next? or from the editor, and Back returns there.
  const [searchFrom, setSearchFrom] = useState<Page>('next')

  const choose = (choice: Choice, from: Page = 'next') => {
    setSearchFrom(from)
    setPage(PAGE_FOR[choice])
    // Matching needs a few answers about the home first: its postcode, age and type.
    if (choice === 'search' && !isHomeFabricSet(useFabric.getState().home)) setFabricOpen(true)
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
    const last = restoreLastScan()
    if (last) useFabric.getState().loadScan(last)
  }, [surveyId, onHomes])

  return (
    <div className={editing ? 'app full' : 'app'}>
      {/* The editor has a header of its own. */}
      {!editing && (
        <header className="topbar">
          <h1 className="brand" aria-label="HeatLossDB">
            <img src="/logo.svg" alt="" width={28} height={28} />
            <span aria-hidden="true">
              heatloss<span className="brand-db">db</span>
            </span>
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
      ) : page === 'next' ? (
        <WhatNext profile={profile} onChoose={choose} />
      ) : page === 'matches' ? (
        profile ? (
          <MatchesPage surveyId={surveyId} profile={profile} onBack={() => setPage(searchFrom)} onFabric={() => setFabricOpen(true)} />
        ) : (
          <div className="dropzone">
            <p className="muted">This scan has no floor outline to match yet.</p>
          </div>
        )
      ) : page === 'explore' ? (
        <ExplorePage surveyId={surveyId} onBack={() => setPage('next')} />
      ) : (
        <ScanEditor onBack={() => setPage('next')} onSearch={() => choose('search', 'scan')} startSharing={page === 'share'} />
      )}

      {fabricOpen && scan && !editing && <HomeFabricDialog onClose={() => setFabricOpen(false)} />}
    </div>
  )
}
