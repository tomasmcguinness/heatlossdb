import { useEffect, useState } from 'react'
import { storeyName, useFabric } from '../fabric/store'
import {
  estimateFor,
  formatKw,
  formatKwh,
  formatRange,
  formatTemperature,
  isHeatPumpData,
  type Estimate,
  type HeatPumpData,
} from '../match/heatPump'
import { isShapeProfile, type ShapeProfile } from '../match/profile'
import { compare, placePlans, summarise, uprightRotation, type Match } from '../match/similarity'
import { PlanSvg } from './PlanSvg'

interface Candidate {
  id: string
  createdAt: string
  profile: unknown
  heatPump?: unknown
}

interface ScoredCandidate {
  id: string
  createdAt: string
  profile: ShapeProfile
  heatPump: HeatPumpData | null
  match: Match
}

/** The result of one request for candidates, tagged with which request it answered. */
interface Fetched {
  request: string
  candidates: Candidate[] | null
}

const m2 = (v: number) => `${Math.round(v)} m²`

function storeyLabels(count: number): string[] {
  const stories = Array.from({ length: count }, (_, i) => i)
  return stories.map((s) => storeyName(stories, s))
}

function YourHome({ profile }: { profile: ShapeProfile }) {
  const rows: [string, string][] = [
    ['Floor area', m2(profile.floorArea)],
    ['Storeys', String(profile.storeys)],
    ['Outside walls', m2(profile.externalWallArea)],
    ['Party walls', profile.partyWallArea ? m2(profile.partyWallArea) : 'None marked'],
    ['Windows', m2(profile.windowArea)],
  ]
  return (
    <section className="card your-home">
      <h2>Your home</h2>
      <PlanSvg
        storeys={profile.plans}
        rotation={uprightRotation(profile.plans)}
        labels={storeyLabels(profile.plans.length)}
        title="Your floorplan"
      />
      <dl className="stats">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">
        Measured from your scan. Mark party walls in the Scan view: they change which homes match.
      </p>
    </section>
  )
}

function SampleTag({ show }: { show: boolean }) {
  return show ? (
    <span className="tag tag-sample" title="Made-up figures for trying out the page, not from a real home">
      Sample data
    </span>
  ) : null
}

const EMITTERS: Record<string, string> = { radiators: 'radiators', underfloor: 'underfloor heating', mixed: 'radiators and underfloor' }

/** What their heat pump does: the real-world results a prospective owner is looking for. */
function HeatPumpResults({ data, floorArea }: { data: HeatPumpData | null; floorArea: number }) {
  if (!data) return <p className="muted small">Heat pump results: not linked yet.</p>
  const rows: [string, string][] = [
    [
      'Heat loss',
      `${formatKw(data.designHeatLossW)} at ${formatTemperature(data.designOutdoorTemperature)} · ${Math.round(data.designHeatLossW / floorArea)} W/m²${
        data.heatLossBasis ? (data.heatLossBasis === 'measured' ? ' · measured' : ' · from a survey') : ''
      }`,
    ],
  ]
  if (data.heatPump) rows.push(['Heat pump', `${data.heatPump.make} ${data.heatPump.model} · ${data.heatPump.capacityKw} kW`])
  if (data.annual) {
    rows.push(['Heat a year', formatKwh(data.annual.heatDeliveredKwh)])
    rows.push(['Electricity a year', `${formatKwh(data.annual.electricityKwh)} · SCOP ${data.annual.scop.toFixed(1)}`])
  }
  if (data.designFlowTemperature !== undefined) {
    rows.push([
      'Flow temperature',
      `${formatTemperature(data.designFlowTemperature)}${data.emitters ? ` · ${EMITTERS[data.emitters] ?? data.emitters}` : ''}`,
    ])
  }
  return (
    <section className="results">
      <h3>
        Their heat pump <SampleTag show={data.source === 'sample'} />
      </h3>
      <dl className="stats">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The headline: what homes like yours need and achieve, as ranges. */
function EstimateCard({ estimate }: { estimate: Estimate }) {
  const rows: [string, string][] = [['Heat loss', `${formatRange(estimate.heatLossKw, (v) => `${v.toFixed(1)}`)} kW`]]
  if (estimate.heatPumpKw) rows.push(['Heat pump size', `${formatRange(estimate.heatPumpKw, (v) => `${v}`)} kW`])
  if (estimate.annualHeatKwh) rows.push(['Heat a year', formatRange(estimate.annualHeatKwh, formatKwh)])
  if (estimate.scop) rows.push(['Efficiency (SCOP)', formatRange(estimate.scop, (v) => v.toFixed(1))])
  return (
    <section className="card estimate">
      <h3>
        Homes like yours <SampleTag show={estimate.sample} />
      </h3>
      <dl className="stats large">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">
        From your {estimate.basedOn === 1 ? 'closest match' : `${estimate.basedOn} closest matches`}. Heat loss and heat
        use are scaled to your floor area. A guide from real homes, not a heat loss survey.
      </p>
    </section>
  )
}

function MatchCard({ yours, candidate }: { yours: ShapeProfile; candidate: ScoredCandidate }) {
  const { match, profile } = candidate
  const placed = placePlans(profile.plans, match.placement)
  return (
    <article className="card match">
      <header className="match-header">
        <span className="match-score">{match.score}%</span>
        <span className="muted small">
          match · uploaded {new Date(candidate.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </span>
      </header>
      <PlanSvg
        storeys={yours.plans}
        overlay={placed}
        rotation={uprightRotation(yours.plans)}
        labels={storeyLabels(Math.max(yours.plans.length, placed.length))}
        title={`Their floorplan (dashed) over yours (shaded), ${match.score}% match`}
      />
      <p className="match-summary">{summarise(match)}</p>
      <details>
        <summary>Why this score</summary>
        <table className="factors">
          <thead>
            <tr>
              <th scope="col">Compared</th>
              <th scope="col">Yours</th>
              <th scope="col">Theirs</th>
              <th scope="col">
                <span className="visually-hidden">How alike</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {match.factors.map((f) => (
              <tr key={f.key} className={f.informative ? undefined : 'not-counted'}>
                <th scope="row">{f.label}</th>
                <td>{f.yours}</td>
                <td>{f.theirs}</td>
                <td>
                  {f.informative ? (
                    <span className="bar" aria-label={`${Math.round(f.similarity * 100)}% alike`}>
                      <span style={{ width: `${Math.round(f.similarity * 100)}%` }} />
                    </span>
                  ) : (
                    <span className="muted small">Not counted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <HeatPumpResults data={candidate.heatPump} floorArea={profile.floorArea} />
    </article>
  )
}

export function MatchesPage({ surveyId, profile }: { surveyId: string; profile: ShapeProfile }) {
  const scan = useFabric((s) => s.scan)
  const [reload, setReload] = useState(0)
  const request = `${surveyId}#${reload}`
  const [fetched, setFetched] = useState<Fetched | null>(null)
  // Scores belong to one set of candidates and one version of your profile; stale ones aren't shown.
  const [scoredFor, setScoredFor] = useState<{ source: Candidate[]; profile: ShapeProfile; list: ScoredCandidate[] }>()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/surveys/${surveyId}/candidates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: Candidate[]) => !cancelled && setFetched({ request, candidates: list }))
      .catch(() => !cancelled && setFetched({ request, candidates: null }))
    return () => {
      cancelled = true
    }
  }, [surveyId, request])

  const current = fetched?.request === request ? fetched : null
  const status = !current ? 'loading' : current.candidates ? 'ready' : 'error'
  const candidates = current?.candidates

  // Matching takes a few tens of milliseconds per home; score one at a time so the page stays
  // responsive, showing results as they arrive.
  useEffect(() => {
    if (!candidates) return
    let cancelled = false
    const results: ScoredCandidate[] = []
    const valid = candidates.filter((c) => isShapeProfile(c.profile))
    const next = (i: number) => {
      if (cancelled || i >= valid.length) return
      const c = valid[i]
      const theirs = c.profile as ShapeProfile
      results.push({
        id: c.id,
        createdAt: c.createdAt,
        profile: theirs,
        heatPump: isHeatPumpData(c.heatPump) ? c.heatPump : null,
        match: compare(profile, theirs),
      })
      setScoredFor({ source: candidates, profile, list: [...results].sort((a, b) => b.match.score - a.match.score) })
      setTimeout(() => next(i + 1))
    }
    const first = setTimeout(() => next(0))
    return () => {
      cancelled = true
      clearTimeout(first)
    }
  }, [candidates, profile])

  if (!scan) return null
  const scored =
    candidates && scoredFor?.source === candidates && scoredFor.profile === profile ? scoredFor.list : []
  const pending = (candidates ?? []).filter((c) => isShapeProfile(c.profile)).length - scored.length
  const estimate =
    pending === 0
      ? estimateFor(
          profile.floorArea,
          scored.map((c) => ({ score: c.match.score, floorArea: c.profile.floorArea, heatPump: c.heatPump })),
        )
      : null

  return (
    <div className="matches-page">
      <YourHome profile={profile} />

      <section className="matches">
        <div className="matches-heading">
          <h2>Similar homes</h2>
          <button className="button subtle" onClick={() => setReload((n) => n + 1)}>
            Refresh
          </button>
        </div>
        <p className="muted">
          Matched on size, layout, outside wall, windows and storeys. Their floorplan is drawn dashed over yours. Fabric
          and real heat pump results will be added as owners describe their homes.
        </p>

        {status === 'loading' && <p className="muted">Finding homes to compare…</p>}
        {status === 'error' && (
          <p className="error" role="alert">
            Couldn't load other homes. Try Refresh.
          </p>
        )}
        {status === 'ready' && candidates?.length === 0 && (
          <div className="card empty">
            <p>No other homes to compare with yet.</p>
            <p className="muted small">Matches appear here as more people upload scans from the app.</p>
          </div>
        )}
        {pending > 0 && <p className="muted small">Comparing {pending} more…</p>}
        {estimate && <EstimateCard estimate={estimate} />}

        <div className="match-list">
          {scored.map((c) => (
            <MatchCard key={c.id} yours={profile} candidate={c} />
          ))}
        </div>
      </section>
    </div>
  )
}
