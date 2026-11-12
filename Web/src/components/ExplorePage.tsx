// Explore the database: browse the homes others have shared.
import { useMemo, useState } from 'react'
import { AGE_BANDS, labelIn, NOT_SURE, PROPERTY_TYPES } from '../fabric/home'
import { storeyLabels } from '../fabric/store'
import { useCandidates, type Candidate } from '../match/candidates'
import { climateFor } from '../match/climate'
import { formatKw, formatTemperature } from '../match/heatPump'
import { uprightRotation } from '../match/similarity'
import { outwardCode } from '../share/postcode'
import { PlanSvg } from './PlanSvg'

type Sort = 'newest' | 'size' | 'heatLoss' | 'scop'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'size', label: 'Floor area' },
  { value: 'heatLoss', label: 'Heat loss per m², lowest first' },
  { value: 'scop', label: 'Heat pump efficiency (SCOP), best first' },
]

const m2 = (v: number) => `${Math.round(v)} m²`
const wattsPerM2 = (c: Candidate) => (c.heatPump && c.profile.floorArea ? c.heatPump.designHeatLossW / c.profile.floorArea : null)

/** Sorts numbers best first, with homes that don't have the figure last. */
const byFigure = (value: (c: Candidate) => number | null | undefined, descending: boolean) => (a: Candidate, b: Candidate) => {
  const x = value(a)
  const y = value(b)
  if (x == null) return y == null ? 0 : 1
  if (y == null) return -1
  return descending ? y - x : x - y
}

const SORTERS: Record<Sort, (a: Candidate, b: Candidate) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  size: byFigure((c) => c.profile.floorArea, true),
  heatLoss: byFigure(wattsPerM2, false),
  scop: byFigure((c) => c.heatPump?.annual?.scop, true),
}

function HomeCard({ home }: { home: Candidate }) {
  const { profile, heatPump, share } = home
  const climate = climateFor(share?.postcodeDistrict)
  const perM2 = wattsPerM2(home)
  const rows: [string, string][] = [
    ['Floor area', `${m2(profile.floorArea)} · ${profile.storeys} ${profile.storeys === 1 ? 'storey' : 'storeys'}`],
  ]
  if (share) rows.push(['Area', climate ? `${share.postcodeDistrict} · ${formatTemperature(climate.designTemperature)} design` : share.postcodeDistrict])
  if (heatPump && perM2 !== null) rows.push(['Heat loss', `${formatKw(heatPump.designHeatLossW)} · ${Math.round(perM2)} W/m²`])
  if (heatPump?.heatPump) rows.push(['Heat pump', `${heatPump.heatPump.make} ${heatPump.heatPump.model} · ${heatPump.heatPump.capacityKw} kW`])
  if (heatPump?.annual) rows.push(['SCOP', heatPump.annual.scop.toFixed(1)])
  return (
    <article className="card explore-home">
      <PlanSvg storeys={profile.plans} rotation={uprightRotation(profile.plans)} labels={storeyLabels(profile.plans.length)} title="Floorplan" />
      <h3>
        {share?.name ?? 'Home'}
        {heatPump?.source === 'sample' && (
          <span className="tag tag-sample" title="Made-up figures for trying out the page, not from a real home">
            Sample data
          </span>
        )}
      </h3>
      {!share && <p className="muted small">The owner hasn’t described this home yet.</p>}
      <dl className="stats">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

/** Explore the database: every shared home, filtered by area, age and type. */
export function ExplorePage({ surveyId, onBack }: { surveyId: string | null; onBack: () => void }) {
  const [reload, setReload] = useState(0)
  const state = useCandidates(surveyId, reload)
  const [area, setArea] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [ageBand, setAgeBand] = useState('')
  const [sort, setSort] = useState<Sort>('newest')

  // "SW", "SW1A" or a full postcode: homes in that postcode area, or that district if one is given.
  const areaFilter = useMemo(() => {
    const text = area.trim().toUpperCase()
    if (!text) return null
    const district = outwardCode(text)
    return district ?? (/^[A-Z]{1,2}$/.test(text) ? text : null)
  }, [area])
  const areaInvalid = area.trim() !== '' && areaFilter === null

  const all = state.status === 'ready' ? state.candidates : []
  const homes = all
    .filter((c) => {
      if (areaFilter) {
        const district = c.share?.postcodeDistrict
        if (!district) return false
        const matches = /\d/.test(areaFilter) ? district === areaFilter : climateFor(district)?.area === areaFilter
        if (!matches) return false
      }
      if (propertyType && c.share?.home?.propertyType !== propertyType) return false
      if (ageBand && c.share?.home?.ageBand !== ageBand) return false
      return true
    })
    .sort(SORTERS[sort])
  const withFigures = homes.filter((c) => c.heatPump).length

  return (
    <div className="explore-page">
      <div className="page-back">
        <button className="link" onClick={onBack}>
          ← What next?
        </button>
      </div>
      <div className="matches-heading">
        <h2>Explore the database</h2>
        <button className="button subtle" onClick={() => setReload((n) => n + 1)}>
          Refresh
        </button>
      </div>

      <form className="explore-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filter homes">
        <label className="field">
          <span className="field-label">Postcode area</span>
          <input
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="SW or SW1A"
            value={area}
            aria-invalid={areaInvalid ? true : undefined}
            onChange={(e) => setArea(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Property type</span>
          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            <option value="">Any</option>
            {PROPERTY_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Built</span>
          <select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
            <option value="">Any time</option>
            {AGE_BANDS.filter((c) => c.value !== NOT_SURE).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </form>
      {areaInvalid && (
        <p className="share-error" role="alert">
          Enter a postcode area like SW, or the first part of a postcode like SW1A.
        </p>
      )}

      {state.status === 'loading' && <p className="muted">Loading homes…</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          Couldn't load homes. Try Refresh.
        </p>
      )}
      {state.status === 'ready' && (
        <p className="muted small" aria-live="polite">
          {homes.length === all.length
            ? `${all.length} ${all.length === 1 ? 'home' : 'homes'}`
            : `${homes.length} of ${all.length} homes`}
          {withFigures > 0 && ` · ${withFigures} with heat loss figures`}
          {(propertyType || ageBand) &&
            ` · ${[labelIn(PROPERTY_TYPES, propertyType), labelIn(AGE_BANDS, ageBand)].filter(Boolean).join(', ').toLowerCase()}`}
        </p>
      )}
      {state.status === 'ready' && homes.length === 0 && (
        <div className="card empty">
          <p>{all.length ? 'No homes match these filters.' : 'No homes have been shared yet.'}</p>
        </div>
      )}

      <div className="match-list">
        {homes.map((c) => (
          <HomeCard key={c.id} home={c} />
        ))}
      </div>
    </div>
  )
}
