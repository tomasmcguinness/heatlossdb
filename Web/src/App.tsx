import { useEffect, useState } from 'react'
import { DefaultsPanel } from './components/DefaultsPanel'
import { DropZone } from './components/DropZone'
import { ElementPanel } from './components/ElementPanel'
import { StoreysPanel } from './components/StoreysPanel'
import { Summary } from './components/Summary'
import { Toolbar } from './components/Toolbar'
import { Viewer } from './components/Viewer'
import { errorMessage, loadDevScan, loadSurvey, surveyIdFromPath } from './components/files'
import { restoreLastScan, useFabric, type SidebarTab } from './fabric/store'

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'element', label: 'Element' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'storeys', label: 'Storeys' },
  { id: 'summary', label: 'Summary' },
]

export default function App() {
  const scan = useFabric((s) => s.scan)
  const tab = useFabric((s) => s.tab)
  const setTab = useFabric((s) => s.setTab)
  const [error, setError] = useState<string | null>(null)
  // A link from the app (/s/<id>) opens that survey rather than the last one.
  const [surveyId] = useState(() => surveyIdFromPath(location.pathname))
  const [loadingSurvey, setLoadingSurvey] = useState(surveyId !== null)

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
        <h1>HeatLossDB</h1>
        <Toolbar onError={setError} />
      </header>

      {loadingSurvey ? (
        <div className="dropzone">
          <p className="muted">Opening survey…</p>
        </div>
      ) : !scan ? (
        <DropZone error={error} onError={setError} />
      ) : (
        <main className="workspace">
          <div className="viewport">
            <Viewer />
            <div className="legend" aria-hidden="true">
              <span><i className="swatch role-external" /> External</span>
              <span><i className="swatch role-party" /> Party</span>
              <span><i className="swatch role-internal" /> Internal</span>
              <span><i className="swatch kind-window" /> Window</span>
              <span><i className="swatch kind-door" /> Door</span>
            </div>
          </div>
          <aside className="sidebar">
            <nav className="tabs" role="tablist">
              {TABS.filter((t) => t.id !== 'storeys' || scan.stories.length > 1).map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="sidebar-body">
              {tab === 'element' && <ElementPanel />}
              {tab === 'defaults' && <DefaultsPanel />}
              {tab === 'storeys' && <StoreysPanel />}
              {tab === 'summary' && <Summary />}
            </div>
          </aside>
        </main>
      )}
    </div>
  )
}
