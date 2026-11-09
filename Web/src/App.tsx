import { useEffect, useState } from 'react'
import { DropZone } from './components/DropZone'
import { ScanView } from './components/ScanView'
import { WhatNext } from './components/WhatNext'
import { errorMessage, loadDevScan, loadSurvey, surveyIdFromPath } from './components/files'
import { restoreLastScan, useFabric } from './fabric/store'
import { useProfile } from './match/useProfile'

type Page = 'next' | 'scan'

export default function App() {
  const scan = useFabric((s) => s.scan)
  const [error, setError] = useState<string | null>(null)
  // A link from the app (/s/<id>) opens that survey rather than the last one.
  const [surveyId] = useState(() => surveyIdFromPath(location.pathname))
  const [loadingSurvey, setLoadingSurvey] = useState(surveyId !== null)
  // Every newly opened scan starts on What next?, so the page is remembered per scan.
  const [pageFor, setPageFor] = useState<{ hash: string; page: Page } | null>(null)
  const page: Page = scan && pageFor?.hash === scan.hash ? pageFor.page : 'next'
  const setPage = (p: Page) => scan && setPageFor({ hash: scan.hash, page: p })
  const profile = useProfile(surveyId)

  useEffect(() => {
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
  }, [surveyId])

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand" aria-label="HeatLossDB">
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span aria-hidden="true">
            heatloss<span className="brand-db">db</span>
          </span>
        </h1>
      </header>

      {loadingSurvey ? (
        <div className="dropzone">
          <p className="muted">Opening survey…</p>
        </div>
      ) : !scan ? (
        <DropZone error={error} onError={setError} />
      ) : page === 'next' ? (
        <WhatNext profile={profile} onView={() => setPage('scan')} />
      ) : (
        <ScanView stored={surveyId !== null} onBack={() => setPage('next')} />
      )}
    </div>
  )
}
