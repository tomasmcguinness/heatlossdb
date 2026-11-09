import { useFabric, type SidebarTab } from '../fabric/store'
import { DefaultsPanel } from './DefaultsPanel'
import { ElementPanel } from './ElementPanel'
import { StoreysPanel } from './StoreysPanel'
import { Summary } from './Summary'
import { Viewer } from './Viewer'

/*
 * Parked: the 3D fabric editor (marking walls, U-values, lining up storeys). It isn't shown at
 * the moment; ScanView is the scan viewer. To bring it back, render <FabricEditor /> as a page
 * in App with <Toolbar /> in the top bar.
 */

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'element', label: 'Element' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'storeys', label: 'Storeys' },
  { id: 'summary', label: 'Summary' },
]

export function FabricEditor({ error }: { error: string | null }) {
  const scan = useFabric((s) => s.scan)
  const tab = useFabric((s) => s.tab)
  const setTab = useFabric((s) => s.setTab)
  if (!scan) return null

  return (
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
  )
}
