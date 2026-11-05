import { FIELDS, KIND_LABELS } from '../fabric/options'
import { effectiveField, effectiveRole, storeyName, useFabric } from '../fabric/store'
import { areaOf } from '../scan/geometry'
import type { ScanElement } from '../scan/types'

const m2 = (value: number) => `${value.toFixed(1)} m²`

/** Areas of the building's envelope, measured from the scan. No heat loss is calculated. */
export function Summary() {
  const state = useFabric()
  const { scan, childrenOf, select } = state
  if (!scan) return null

  const roleOf = (e: ScanElement) => effectiveRole(state, e.id)
  const of = (kind: ScanElement['kind'], role?: string) =>
    scan.elements.filter((e) => e.kind === kind && (!role || roleOf(e) === role))

  const externalWalls = of('wall', 'external')
  const grossWall = externalWalls.reduce((sum, w) => sum + areaOf(w), 0)
  const wallOpenings = externalWalls
    .flatMap((w) => childrenOf.get(w.id) ?? [])
    .reduce((sum, child) => sum + areaOf(child), 0)
  const partyWall = of('wall', 'party').reduce((sum, w) => sum + areaOf(w), 0)
  const addedWalls = externalWalls.filter((w) => w.synthetic)
  const windows = of('window', 'external')
  const doors = of('door', 'external')
  const groundFloors = of('floor', 'external')
  const roofs = of('ceiling', 'external')
  const floorsByStorey = scan.stories.map((story) => ({
    story,
    area: scan.elements.filter((e) => e.kind === 'floor' && e.story === story).reduce((sum, f) => sum + areaOf(f), 0),
  }))

  // External and party elements still missing a construction detail.
  const needsDetails = scan.elements.filter(
    (e) =>
      roleOf(e) !== 'internal' &&
      FIELDS[e.kind].length > 0 &&
      FIELDS[e.kind].some((field) => effectiveField(state, e, field.key).source === 'unset'),
  )

  const rows: [string, string][] = [
    ['External walls', `${externalWalls.length} · ${m2(grossWall - wallOpenings)} net (${m2(grossWall)} gross)`],
    ...(addedWalls.length
      ? ([['Gaps closed', `${addedWalls.length} · ${m2(addedWalls.reduce((s, w) => s + areaOf(w), 0))} added`]] as [string, string][])
      : []),
    ['Party walls', partyWall ? m2(partyWall) : 'None marked'],
    ['Windows', `${windows.length} · ${m2(windows.reduce((s, w) => s + areaOf(w), 0))}`],
    ['External doors', `${doors.length} · ${m2(doors.reduce((s, d) => s + areaOf(d), 0))}`],
    ['Ground floor', m2(groundFloors.reduce((s, f) => s + areaOf(f), 0))],
    ['Roof', m2(roofs.reduce((s, r) => s + areaOf(r), 0))],
  ]

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Summary</h2>
        <p className="muted">
          Measured from the scan. Areas are to the inside face of walls, and floors include built-in storage.
        </p>
      </header>

      <section>
        <h3>Envelope</h3>
        <dl className="stats">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>Floor area</h3>
        <dl className="stats">
          {floorsByStorey.map(({ story, area }) => (
            <div key={story}>
              <dt>{storeyName(scan.stories, story)}</dt>
              <dd>{m2(area)}</dd>
            </div>
          ))}
          <div>
            <dt>Total</dt>
            <dd>{m2(floorsByStorey.reduce((s, f) => s + f.area, 0))}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3>Still to describe</h3>
        {needsDetails.length === 0 ? (
          <p className="muted small">Every external and party element has its construction set.</p>
        ) : (
          <>
            <p className="muted small">
              {needsDetails.length} external or party elements are missing details. Setting Defaults fills most of them
              at once.
            </p>
            <ul className="plain">
              {needsDetails.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <button className="link" onClick={() => select(e.id)}>
                    {KIND_LABELS[e.kind].one} · {storeyName(scan.stories, e.story)} · {m2(areaOf(e))}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
