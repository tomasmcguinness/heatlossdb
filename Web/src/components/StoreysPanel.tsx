import { alignmentOf, storeyName, useFabric } from '../fabric/store'
import { IDENTITY, isIdentity, type StoreyAlignment } from '../scan/align'

const MOVE_STEP = 0.05
const TURN_STEPS = [-1, -0.1, 0.1, 1]

function same(a: StoreyAlignment, b: StoreyAlignment) {
  return (
    Math.abs(a.rotation - b.rotation) < 1e-6 && Math.abs(a.dx - b.dx) < 1e-6 && Math.abs(a.dz - b.dz) < 1e-6
  )
}

export function StoreysPanel() {
  const scan = useFabric((s) => s.scan)
  const alignment = useFabric((s) => s.alignment)
  const autoAlignment = useFabric((s) => s.autoAlignment)
  const setAlignment = useFabric((s) => s.setAlignment)
  const view = useFabric((s) => s.view)
  const setView = useFabric((s) => s.setView)
  const resetView = useFabric((s) => s.resetView)
  if (!scan) return null

  const [lowest, ...upper] = scan.stories

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Storeys</h2>
        <p className="muted">
          Storeys scanned separately, or after tracking drifted on the stairs, can be out of line. Each storey is lined
          up with the one below automatically; nudge it here if it's not quite right.
        </p>
      </header>

      {(view.camera !== 'plan' || view.hiddenStories.length > 0 || view.spreadStoreys) && (
        <button
          className="button subtle"
          onClick={() => {
            setView({ hiddenStories: [], spreadStoreys: false })
            resetView('plan')
          }}
        >
          Show all storeys from above
        </button>
      )}

      <section>
        <h3>{storeyName(scan.stories, lowest)}</h3>
        <p className="muted small">The reference: other storeys line up with this one.</p>
      </section>

      {upper.map((story) => {
        const current = alignmentOf({ alignment }, story)
        const automatic = autoAlignment[story] ?? IDENTITY
        const update = (change: Partial<StoreyAlignment>) => setAlignment(story, { ...current, ...change })
        const status = same(current, automatic)
          ? 'Lined up automatically'
          : isIdentity(current)
            ? 'As scanned'
            : 'Adjusted by hand'
        return (
          <section key={story}>
            <h3>
              {storeyName(scan.stories, story)} <span className="tag">{status}</span>
            </h3>
            <p className="muted small">
              Turned {current.rotation.toFixed(1)}°, moved {Math.hypot(current.dx, current.dz).toFixed(2)} m from where it
              was scanned.
            </p>

            <div className="align-row">
              <span className="field-label">Turn</span>
              <div className="segmented compact">
                {TURN_STEPS.map((step) => (
                  <button key={step} onClick={() => update({ rotation: current.rotation + step })}>
                    {step > 0 ? '+' : '−'}
                    {Math.abs(step)}°
                  </button>
                ))}
              </div>
            </div>

            <div className="align-row">
              <span className="field-label">Move {MOVE_STEP * 100} cm</span>
              {/* Directions as seen in the plan view, where screen up is −z. */}
              <div className="segmented compact">
                <button aria-label="Move left" onClick={() => update({ dx: current.dx - MOVE_STEP })}>
                  ←
                </button>
                <button aria-label="Move up" onClick={() => update({ dz: current.dz - MOVE_STEP })}>
                  ↑
                </button>
                <button aria-label="Move down" onClick={() => update({ dz: current.dz + MOVE_STEP })}>
                  ↓
                </button>
                <button aria-label="Move right" onClick={() => update({ dx: current.dx + MOVE_STEP })}>
                  →
                </button>
              </div>
            </div>

            <div className="align-row">
              <button
                className="button subtle"
                disabled={same(current, automatic)}
                onClick={() => setAlignment(story, automatic)}
              >
                Line up automatically
              </button>
              <button className="button subtle" disabled={isIdentity(current)} onClick={() => setAlignment(story, IDENTITY)}>
                As scanned
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
