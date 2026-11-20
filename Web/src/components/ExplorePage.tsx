// Explore the database: browse the homes others have shared.
import { useState, type FormEvent } from 'react'
import { AGE_BANDS, labelIn, NOT_SURE, PROPERTY_TYPES } from '../fabric/home'
import { useCandidates, type Candidate } from '../match/candidates'
import {
  AREA_BANDS,
  byArea,
  hasInstallerCalc,
  matchesFilters,
  measuredScop,
  NO_FILTERS,
  searchArea,
  SORTERS,
  SORTS,
  totalsOf,
  wattsPerM2,
  type ExploreFilters,
  type Sort,
} from '../match/explore'
import { formatKw } from '../match/heatPump'
import { uprightRotation } from '../match/similarity'
import { PlanSvg } from './PlanSvg'

/** Homes shown at first, and how many more each "Show more homes" adds. */
const PAGE = 12

const AGES = AGE_BANDS.filter((c) => c.value !== NOT_SURE)
const kw = (watts: number) => formatKw(watts)
const perM2 = (value: number | null) => (value === null ? '–' : `${Math.round(value)} W/m²`)

type View = 'homes' | 'areas'

/** Explore the database: every shared home, searched by area and filtered by type, age, size and
 *  the data it has. */
export function ExplorePage({ surveyId, onBack }: { surveyId: string | null; onBack: () => void }) {
  const [reload, setReload] = useState(0)
  const state = useCandidates(surveyId, reload)
  const [search, setSearch] = useState('')
  const [searchError, setSearchError] = useState(false)
  const [filters, setFilters] = useState<ExploreFilters>(NO_FILTERS)
  const [sort, setSort] = useState<Sort>('recent')
  const [view, setView] = useState<View>('homes')
  const [shown, setShown] = useState(PAGE)

  const all = state.status === 'ready' ? state.candidates : []
  const totals = totalsOf(all)
  const homes = all.filter((c) => matchesFilters(c, filters)).sort(SORTERS[sort])
  const areas = byArea(homes)

  const update = (patch: Partial<ExploreFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setShown(PAGE)
  }
  const toggle = (key: 'propertyTypes' | 'ageBands', value: string) =>
    update({ [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] })

  const runSearch = (e: FormEvent) => {
    e.preventDefault()
    const area = searchArea(search)
    setSearchError(search.trim() !== '' && area === null)
    if (search.trim() === '' || area) update({ area })
  }
  const seeArea = (district: string) => {
    setSearch(district)
    setSearchError(false)
    update({ area: district })
    setView('homes')
  }

  const summary = [
    filters.area,
    ...filters.propertyTypes.map((v) => labelIn(PROPERTY_TYPES, v)),
    ...filters.ageBands.map((v) => labelIn(AGE_BANDS, v)),
    AREA_BANDS.find((b) => b.value === filters.floorArea)?.label,
    filters.hasHeatPump && 'with a heat pump',
    filters.measured && 'measured performance',
    filters.installerCalc && 'installer calc',
  ].filter(Boolean)

  return (
    <main className="explore">
      <div className="page-back">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
      </div>

      <div className="explore-head">
        <div className="explore-intro">
          <h1>Explore the database</h1>
          <p className="muted">Heat loss and heat pump data shared by homeowners across the UK.</p>
        </div>
        <form role="search" className="explore-search" onSubmit={runSearch}>
          <label htmlFor="ex-search" className="visually-hidden">
            Search by postcode district
          </label>
          <input
            id="ex-search"
            type="search"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Postcode district, e.g. B91"
            value={search}
            aria-invalid={searchError ? true : undefined}
            aria-describedby={searchError ? 'ex-search-error' : undefined}
            onChange={(e) => {
              setSearch(e.target.value)
              // Clearing the box shows every area again.
              if (e.target.value.trim() === '' && filters.area) update({ area: null })
            }}
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>
      </div>
      {searchError && (
        <p id="ex-search-error" className="share-error" role="alert">
          Enter a postcode area like SW, or the first part of a postcode like B91.
        </p>
      )}

      <div className="explore-tiles">
        <Tile label="Homes shared" value={state.status === 'ready' ? String(totals.homes) : '–'} />
        <Tile label="Median heat loss per m²" value={perM2(totals.medianWattsPerM2)} />
        <Tile label="With a heat pump" value={state.status === 'ready' ? String(totals.withHeatPump) : '–'} />
        <Tile label="With measured performance" value={state.status === 'ready' ? String(totals.measured) : '–'} />
      </div>

      <div className="explore-body">
        <aside className="explore-filters" aria-label="Filters">
          <div className="explore-filters-head">
            <h2>Filters</h2>
            <button
              type="button"
              className="link"
              onClick={() => {
                update({ ...NO_FILTERS, area: filters.area })
              }}
            >
              Clear all
            </button>
          </div>

          <fieldset>
            <legend>Property type</legend>
            <div className="chips">
              {PROPERTY_TYPES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="chip"
                  aria-pressed={filters.propertyTypes.includes(c.value)}
                  onClick={() => toggle('propertyTypes', c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Age</legend>
            <div className="chips">
              {AGES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="chip"
                  aria-pressed={filters.ageBands.includes(c.value)}
                  onClick={() => toggle('ageBands', c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="explore-field">
            <span>Floor area</span>
            <select value={filters.floorArea} onChange={(e) => update({ floorArea: e.target.value })}>
              <option value="">Any size</option>
              {AREA_BANDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>Data available</legend>
            <label className="explore-check">
              <input type="checkbox" checked={filters.hasHeatPump} onChange={(e) => update({ hasHeatPump: e.target.checked })} />
              Has a heat pump
            </label>
            <label className="explore-check">
              <input type="checkbox" checked={filters.measured} onChange={(e) => update({ measured: e.target.checked })} />
              Measured performance
            </label>
            <label className="explore-check">
              <input type="checkbox" checked={filters.installerCalc} onChange={(e) => update({ installerCalc: e.target.checked })} />
              Installer heat loss calculation
            </label>
          </fieldset>
        </aside>

        <section className="explore-results" aria-label="Results">
          <div className="explore-results-head">
            <span aria-live="polite">
              <strong>
                {homes.length} {homes.length === 1 ? 'home' : 'homes'}
              </strong>
              {summary.length > 0 && <span className="muted"> · {summary.join(', ')}</span>}
            </span>
            <div className="explore-controls">
              <div className="view-tabs" role="tablist" aria-label="View">
                {(['homes', 'areas'] as View[]).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                    {v === 'homes' ? 'Homes' : 'By area'}
                  </button>
                ))}
              </div>
              {view === 'homes' && (
                <label className="explore-sort">
                  <span className="muted">Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          {state.status === 'loading' && <p className="muted">Loading homes…</p>}
          {state.status === 'error' && (
            <div className="card empty">
              <p role="alert">Couldn’t load homes.</p>
              <button className="button subtle" onClick={() => setReload((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}
          {state.status === 'ready' && homes.length === 0 && (
            <div className="card empty">
              <p>{all.length ? 'No homes match these filters.' : 'No homes have been shared yet.'}</p>
            </div>
          )}

          {view === 'homes' && homes.length > 0 && (
            <>
              <ul className="explore-homes">
                {homes.slice(0, shown).map((c) => (
                  <HomeCard key={c.id} home={c} />
                ))}
              </ul>
              {homes.length > shown && (
                <button type="button" className="button subtle explore-more" onClick={() => setShown((n) => n + PAGE)}>
                  Show more homes
                </button>
              )}
            </>
          )}

          {view === 'areas' && areas.length > 0 && (
            <div className="explore-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col" className="num">
                      Homes
                    </th>
                    <th scope="col" className="num">
                      Median W/m²
                    </th>
                    <th scope="col" className="num">
                      Typical heat pump
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map((a) => (
                    <tr key={a.district}>
                      <th scope="row">{a.district}</th>
                      <td className="num">{a.homes}</td>
                      <td className="num">{a.medianWattsPerM2 === null ? '–' : Math.round(a.medianWattsPerM2)}</td>
                      <td className="num">{a.typicalHeatPumpKw === null ? '–' : `${a.typicalHeatPumpKw} kW`}</td>
                      <td className="num">
                        <button type="button" className="link" onClick={() => seeArea(a.district)}>
                          See homes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view === 'areas' && state.status === 'ready' && homes.length > 0 && areas.length === 0 && (
            <p className="muted">None of these homes has shared its area yet.</p>
          )}

          <div className="explore-cta">
            <span>Every shared home makes these numbers more useful. Scanned yours?</span>
            <a className="button" href="/new">
              Share your home
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="explore-tile">
      <span className="muted small">{label}</span>
      <span className="explore-tile-value">{value}</span>
    </div>
  )
}

function HomeCard({ home }: { home: Candidate }) {
  const { profile, heatPump, share } = home
  const type = labelIn(PROPERTY_TYPES, share?.home?.propertyType)
  const age = labelIn(AGE_BANDS, share?.home?.ageBand)
  const scop = measuredScop(home)
  const title = share ? [share.postcodeDistrict, type].filter(Boolean).join(' · ') : 'Home not described yet'
  const details = [age, `${Math.round(profile.floorArea)} m²`, `${profile.storeys} ${profile.storeys === 1 ? 'storey' : 'storeys'}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="explore-home">
      <div className="explore-home-plan">
        <PlanSvg storeys={profile.plans} rotation={uprightRotation(profile.plans)} title="Floor plan" />
      </div>
      <div className="explore-home-body">
        <div className="explore-home-title">
          <strong>{title}</strong>
          <span className="muted small">{details}</span>
        </div>
        <dl className="explore-home-figures">
          <div>
            <dt>Heat loss</dt>
            <dd>{heatPump ? kw(heatPump.designHeatLossW) : '–'}</dd>
          </div>
          <div>
            <dt>Per m²</dt>
            <dd>{perM2(wattsPerM2(home))}</dd>
          </div>
          <div>
            <dt>Heat pump</dt>
            <dd>{heatPump?.heatPump ? `${heatPump.heatPump.capacityKw} kW` : '–'}</dd>
          </div>
        </dl>
        {(scop !== null || hasInstallerCalc(home) || heatPump?.source === 'sample') && (
          <div className="explore-home-badges">
            {scop !== null && <span className="badge-measured">Measured SCOP {scop.toFixed(1)}</span>}
            {hasInstallerCalc(home) && <span className="badge-free">Installer calc</span>}
            {heatPump?.source === 'sample' && (
              <span className="soon-badge" title="Made-up figures for trying out the page, not from a real home">
                Sample data
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
