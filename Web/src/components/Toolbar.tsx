import { useRef } from 'react'
import { storeyName, useFabric } from '../fabric/store'
import { downloadFabric, errorMessage, openFile } from './files'

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Toolbar({ onError }: { onError: (message: string | null) => void }) {
  const scan = useFabric((s) => s.scan)
  const view = useFabric((s) => s.view)
  const setView = useFabric((s) => s.setView)
  const resetView = useFabric((s) => s.resetView)
  const closeScan = useFabric((s) => s.closeScan)
  const importInput = useRef<HTMLInputElement>(null)

  if (!scan) return null

  const toggleStorey = (story: number, visible: boolean) =>
    setView({
      hiddenStories: visible ? view.hiddenStories.filter((s) => s !== story) : [...view.hiddenStories, story],
    })

  return (
    <div className="toolbar">
      <div className="toolbar-group" aria-label="Storeys">
        {scan.stories.map((story) => (
          <Toggle
            key={story}
            label={storeyName(scan.stories, story)}
            checked={!view.hiddenStories.includes(story)}
            onChange={(v) => toggleStorey(story, v)}
          />
        ))}
        {scan.stories.length > 1 && (
          <Toggle label="Spread" checked={view.spreadStoreys} onChange={(v) => setView({ spreadStoreys: v })} />
        )}
      </div>
      <div className="toolbar-group">
        <Toggle label="External only" checked={view.externalOnly} onChange={(v) => setView({ externalOnly: v })} />
        <Toggle label="Ceilings & roof" checked={view.showCeilings} onChange={(v) => setView({ showCeilings: v })} />
        <Toggle label="Storage" checked={view.showStorage} onChange={(v) => setView({ showStorage: v })} />
        <div className="segmented compact" role="radiogroup" aria-label="Camera">
          <button
            role="radio"
            aria-checked={view.camera === 'perspective'}
            className={view.camera === 'perspective' ? 'on' : ''}
            onClick={() => resetView('perspective')}
          >
            3D
          </button>
          <button
            role="radio"
            aria-checked={view.camera === 'plan'}
            className={view.camera === 'plan' ? 'on' : ''}
            onClick={() => resetView('plan')}
          >
            Plan
          </button>
        </div>
        <button className="button subtle" onClick={() => resetView()}>
          Reset view
        </button>
      </div>
      <div className="toolbar-group">
        <button className="button subtle" onClick={downloadFabric}>
          Export
        </button>
        <button className="button subtle" onClick={() => importInput.current?.click()}>
          Import
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              onError(null)
              await openFile(file)
            } catch (error) {
              onError(errorMessage(error))
            }
          }}
        />
        <button
          className="button subtle"
          onClick={() => {
            closeScan()
            // Leave a survey link so a reload doesn't reopen it.
            if (location.pathname !== '/') history.replaceState(null, '', '/')
          }}
        >
          Close scan
        </button>
      </div>
    </div>
  )
}
