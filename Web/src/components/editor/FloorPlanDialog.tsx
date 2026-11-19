import { useEffect, useMemo, useRef, useState } from 'react'
import { effectiveRole, useFabric } from '../../fabric/store'
import { classify } from '../../scan/classify'
import { indexScan } from '../../scan/parse'
import type { Scan } from '../../scan/types'
import {
  acceptTidy,
  floorplanVersions,
  loadTidiedPreview,
  tidySurvey,
  switchVersion,
  type CurrentPlan,
  type FloorplanVersionId,
  type FloorplanVersions,
  type TidyResult,
} from '../../scan/versions'
import { errorMessage, surveyIdFromPath } from '../files'
import { FloorCanvas } from './FloorCanvas'
import { InfoIcon, TidyIcon } from './icons'
import { boundsOf, editorFloors, useEditorFloors, type EditorFloor, type RoomActions } from './model'

const VERSION_NAMES: Record<FloorplanVersionId, string> = { original: 'Original scan', tidied: 'Tidied plan' }

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** The preview only shows the plan: nothing in it can be selected. */
const noActions: RoomActions = { hoveredId: null, selectedId: null, hover: () => {}, select: () => {}, rename: () => {} }

type Busy = 'tidying' | 'switching' | null

/** "84 walls → 61 · 23 changes · 4 to check" and whether every room is closed. */
function summaryText({ summary }: TidyResult): string {
  const parts = [
    `${summary.wallsBefore} walls → ${summary.wallsAfter}`,
    `${summary.changes} ${summary.changes === 1 ? 'change' : 'changes'}`,
    summary.needsReview ? `${summary.needsReview} to check` : 'nothing to check',
  ]
  return parts.join(' · ')
}

/** One floor of the current plan or the preview, drawn as the editor draws it. */
function PlanPreview({ floors, story, isExternal }: { floors: EditorFloor[]; story: number; isExternal: (id: string) => boolean }) {
  const floor = floors.find((f) => f.plan.story === story) ?? floors[0]
  const bounds = boundsOf(floors)
  if (!floor || !Number.isFinite(bounds.width)) return <p className="muted canvas-empty">There’s no floor outline to show for this storey.</p>
  return <FloorCanvas floor={floor} bounds={bounds} actions={noActions} isExternal={isExternal} />
}

/**
 * The home's floor plan: tidy it on the server, compare the tidied plan with the current one, and
 * make it the plan if it's better. The original scan is always kept as a version to go back to.
 */
export function FloorPlanDialog({ onClose, onSwitched }: { onClose: () => void; onSwitched: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const surveyId = surveyIdFromPath(location.pathname)
  const elements = useFabric((s) => s.elements)
  const rooms = useFabric((s) => s.rooms)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const switchScan = useFabric((s) => s.switchScan)
  const currentFloors = useEditorFloors()

  const [versions, setVersions] = useState<FloorplanVersions | null>(null)
  const [preview, setPreview] = useState<{ result: TidyResult; scan: Scan } | null>(null)
  const [showing, setShowing] = useState<'current' | 'tidied'>('tidied')
  const [story, setStory] = useState<number | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    if (!surveyId) return
    floorplanVersions(surveyId)
      .then(setVersions)
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [surveyId])

  // The tidied scan isn't open, so it brings its own automatic roles; the user's roles and rooms
  // apply where its elements and rooms match. Storeys are drawn as the tidier stacked them.
  const tidiedRoles = useMemo(
    () => (preview ? { elements, autoRoles: classify(preview.scan), byId: indexScan(preview.scan).byId } : null),
    [preview, elements],
  )
  const tidiedFloors = useMemo(
    () => (preview && tidiedRoles ? editorFloors(preview.scan, { ...tidiedRoles, rooms, alignment: {} }) : []),
    [preview, tidiedRoles, rooms],
  )

  const close = () => dialog.current?.close()

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const tidy = () =>
    run('tidying', async () => {
      const result = await tidySurvey(surveyId!)
      const scan = await loadTidiedPreview(surveyId!)
      setPreview({ result, scan })
      setShowing('tidied')
      setStory(scan.stories[0] ?? null)
    })

  const switchTo = (change: () => Promise<CurrentPlan>) =>
    run('switching', async () => {
      const { versions: next, scan } = await change()
      switchScan(scan)
      setVersions(next)
      setPreview(null)
      onSwitched()
      close()
    })

  if (!surveyId) return null
  const current = versions?.current ?? 'original'
  const stories = (showing === 'tidied' ? tidiedFloors : currentFloors).map((f) => f.plan.story)
  const shownStory = story !== null && stories.includes(story) ? story : (stories[0] ?? 0)

  return (
    <dialog ref={dialog} className="fabric-dialog" aria-labelledby="floorplan-title" onClose={onClose}>
      <header className="fabric-head">
        <div>
          <h1 id="floorplan-title">Floor plan</h1>
          <p className="muted small">Tidy up the scan, and choose which version of the floor plan to use</p>
        </div>
        <button className="icon-only fabric-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>

      <main className="fabric-main">
        <p className="fabric-note">
          <InfoIcon />
          <span>
            Tidying squares up the walls, joins up the outside walls, lines the floors up, merges walls scanned from both sides
            and closes every room. Your original scan is always kept, so you can switch back at any time.
          </span>
        </p>

        <section className="fabric-card" aria-labelledby="floorplan-versions">
          <div className="fabric-card-head">
            <h2 id="floorplan-versions">Versions</h2>
          </div>
          {versions ? (
            <ul className="floorplan-versions">
              {versions.versions.map((v) => (
                <li key={v.id}>
                  <span>
                    <span>{VERSION_NAMES[v.id]}</span>
                    <span className="small muted">
                      {v.id === 'original' ? `Uploaded ${date(v.at)}` : `Accepted ${date(v.at)}`}
                    </span>
                  </span>
                  {v.id === current ? (
                    <span className="tag tag-set">In use</span>
                  ) : (
                    <button className="button subtle" disabled={busy !== null} onClick={() => switchTo(() => switchVersion(surveyId, v.id))}>
                      Use this
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !error && <p className="small muted">Loading…</p>
          )}
        </section>

        <section className="fabric-card" aria-labelledby="floorplan-tidy">
          <div className="fabric-card-head">
            <span className="fabric-card-icon">
              <TidyIcon size={22} />
            </span>
            <h2 id="floorplan-tidy">Tidy the floor plan</h2>
            <button className="button subtle floorplan-tidy-button" disabled={busy !== null} onClick={tidy}>
              {busy === 'tidying' ? 'Tidying…' : preview || versions?.versions.some((v) => v.id === 'tidied') ? 'Tidy again' : 'Tidy floor plan'}
            </button>
          </div>

          {preview ? (
            <>
              <p className="floorplan-summary">
                {summaryText(preview.result)}
                {preview.result.summary.allRoomsClosed ? ' · every room closed' : ''}
              </p>
              {!preview.result.summary.allRoomsClosed && (
                <p className="small share-error">Still open: {preview.result.summary.openRooms.join('; ')}</p>
              )}

              <div className="floorplan-controls">
                <div className="segmented compact" role="radiogroup" aria-label="Plan shown">
                  {(['current', 'tidied'] as const).map((s) => (
                    <button key={s} role="radio" aria-checked={showing === s} className={showing === s ? 'on' : ''} onClick={() => setShowing(s)}>
                      {s === 'current' ? 'Current plan' : 'Tidied'}
                    </button>
                  ))}
                </div>
                {stories.length > 1 && (
                  <div className="view-tabs" role="tablist" aria-label="Floors">
                    {(showing === 'tidied' ? tidiedFloors : currentFloors).map((f) => (
                      <button
                        key={f.plan.story}
                        role="tab"
                        aria-selected={f.plan.story === shownStory}
                        className={f.plan.story === shownStory ? 'on' : ''}
                        onClick={() => setStory(f.plan.story)}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="floorplan-canvas">
                {showing === 'tidied' && tidiedRoles ? (
                  <PlanPreview
                    key="tidied"
                    floors={tidiedFloors}
                    story={shownStory}
                    isExternal={(id) => effectiveRole(tidiedRoles, id) !== 'internal'}
                  />
                ) : (
                  <PlanPreview
                    key="current"
                    floors={currentFloors}
                    story={shownStory}
                    isExternal={(id) => effectiveRole({ elements, autoRoles, byId }, id) !== 'internal'}
                  />
                )}
              </div>

              {preview.result.summary.needsReview > 0 && (
                <details className="floorplan-review">
                  <summary>
                    {preview.result.summary.needsReview} {preview.result.summary.needsReview === 1 ? 'change' : 'changes'} worth checking
                  </summary>
                  <ul>
                    {preview.result.changes
                      .filter((c) => c.needsReview)
                      .map((c, i) => (
                        <li key={i}>{c.message}</li>
                      ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="small muted">
              {current === 'tidied'
                ? 'You’re using a tidied plan. Tidy again to see whether a newer tidy is better; nothing changes until you accept it.'
                : 'See a tidied version of your scan next to the current one. Nothing changes until you accept it.'}
            </p>
          )}
        </section>

        {error && (
          <p className="share-error" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="fabric-foot">
        <span className="muted small">Your room names, Home fabric and other changes carry over to the plan you choose.</span>
        <div className="fabric-foot-actions">
          {preview ? (
            <>
              <button className="button subtle" disabled={busy !== null} onClick={() => setPreview(null)}>
                Keep current plan
              </button>
              <button className="button" disabled={busy !== null} onClick={() => switchTo(() => acceptTidy(surveyId))}>
                {busy === 'switching' ? 'Switching…' : 'Use tidied plan'}
              </button>
            </>
          ) : (
            <button className="button subtle" onClick={close}>
              Close
            </button>
          )}
        </div>
      </footer>
    </dialog>
  )
}
