// Find similar homes: your scan matched against shared homes, in the browser.
import { useEffect, useMemo, useState } from 'react'
import { isHomeFabricSet } from '../fabric/home'
import { storeyLabels, useFabric } from '../fabric/store'
import { otherHomes, useCandidates, type Candidate } from '../match/candidates'
import { climateFor, designTemperatureFor } from '../match/climate'
import {
  estimateFor,
  formatKw,
  formatKwh,
  formatRange,
  formatTemperature,
  type Estimate,
  type HeatPumpData,
} from '../match/heatPump'
import type { ShapeProfile } from '../match/profile'
import { compare, placePlans, summarise, uprightRotation, type HomeDetails, type Match } from '../match/similarity'
import { listingName } from '../share/listing'
import { PlanSvg } from './PlanSvg'

interface ScoredCandidate extends Candidate {
  match: Match
}

const m2 = (v: number) => `${Math.round(v)} m²`

function YourHome({ profile, onFabric }: { profile: ShapeProfile; onFabric: () => void }) {
  const home = useFabric((s) => s.home)
  const climate = climateFor(home.postcodeDistrict)
  const rows: [string, string][] = [
    ['Floor area', m2(profile.floorArea)],
    ['Storeys', String(profile.storeys)],
    ['Outside walls', m2(profile.externalWallArea)],
    ['Party walls', profile.partyWallArea ? m2(profile.partyWallArea) : 'None marked'],
    ['Windows', m2(profile.windowArea)],
    ['Built', isHomeFabricSet(home) ? listingName(home) : 'Not described yet'],
    ['Area', climate ? `${home.postcodeDistrict} · ${formatTemperature(climate.designTemperature)} design` : 'Not given'],
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
      <button className="button subtle" onClick={onFabric}>
        {isHomeFabricSet(home) ? 'Edit postcode and fabric' : 'Add postcode and fabric'}
      </button>
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
      `${formatKw(data.designHeatLossW)}${data.designOutdoorTemperature !== undefined ? ` at ${formatTemperature(data.designOutdoorTemperature)}` : ''} · ${Math.round(data.designHeatLossW / floorArea)} W/m²${
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
        use are scaled to your floor area
        {estimate.designTemperature !== null
          ? `, and heat loss to ${formatTemperature(estimate.designTemperature)}, your area’s design temperature`
          : ''}
        . A guide from real homes, not a heat loss survey.
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
      {candidate.share && (
        <p className="match-name">
          <strong>{candidate.share.name}</strong> <span className="muted small">in {candidate.share.postcodeDistrict}</span>
        </p>
      )}
      <p className="match-summary">{summarise(match)}</p>
      <div className="match-body">
        <div className="match-plan">
          <PlanSvg
            storeys={yours.plans}
            overlay={placed}
            rotation={uprightRotation(yours.plans)}
            labels={storeyLabels(Math.max(yours.plans.length, placed.length))}
            title={`Their floorplan (dashed) over yours (shaded), ${match.score}% match`}
          />
        </div>
        <table className="factors">
          <caption className="visually-hidden">Why this score</caption>
          <thead>
            <tr>
              <th scope="col">Compared</th>
              <th scope="col">Yours</th>
              <th scope="col">Theirs</th>
              <th scope="col" className="factor-match-head">
                Match
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
                    <span className="factor-match" aria-label={`${Math.round(f.similarity * 100)}% alike`}>
                      {Math.round(f.similarity * 100)}%
                    </span>
                  ) : (
                    <span className="muted small">Not counted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HeatPumpResults data={candidate.heatPump} floorArea={profile.floorArea} />
    </article>
  )
}

interface MatchesPageProps {
  /** The uploaded survey, or null for a scan opened from a file (which isn't on the server). */
  surveyId: string | null
  profile: ShapeProfile
  onBack: () => void
  /** Opens Home fabric, where the postcode and how the home is built are asked for. */
  onFabric: () => void
}

export function MatchesPage({ surveyId, profile, onBack, onFabric }: MatchesPageProps) {
  const scan = useFabric((s) => s.scan)
  const home = useFabric((s) => s.home)
  const [reload, setReload] = useState(0)
  const state = useCandidates(surveyId, reload)
  const scanHash = scan?.hash
  // The server leaves out an uploaded survey itself, but not your scan opened from a file, or
  // uploaded again from another of the app's surveys.
  const loaded = state.status === 'ready' ? state.candidates : null
  const candidates = useMemo(() => (loaded && scanHash ? otherHomes(loaded, scanHash) : null), [loaded, scanHash])
  // Scores belong to one set of candidates, one version of your profile and one set of your
  // answers; stale ones aren't shown.
  const [scoredFor, setScoredFor] = useState<{ source: Candidate[]; profile: ShapeProfile; home: unknown; list: ScoredCandidate[] }>()

  // Matching takes a few tens of milliseconds per home; score one at a time so the page stays
  // responsive, showing results as they arrive.
  useEffect(() => {
    if (!candidates) return
    let cancelled = false
    const results: ScoredCandidate[] = []
    const yours: HomeDetails = { home, postcodeDistrict: home.postcodeDistrict }
    const next = (i: number) => {
      if (cancelled || i >= candidates.length) return
      const c = candidates[i]
      results.push({ ...c, match: compare(profile, c.profile, { yours, theirs: c.share ?? undefined }) })
      setScoredFor({ source: candidates, profile, home, list: [...results].sort((a, b) => b.match.score - a.match.score) })
      setTimeout(() => next(i + 1))
    }
    const first = setTimeout(() => next(0))
    return () => {
      cancelled = true
      clearTimeout(first)
    }
  }, [candidates, profile, home])

  if (!scan) return null
  const scored =
    candidates && scoredFor?.source === candidates && scoredFor.profile === profile && scoredFor.home === home
      ? scoredFor.list
      : []
  const pending = (candidates?.length ?? 0) - scored.length
  const estimate =
    pending === 0
      ? estimateFor(
          profile.floorArea,
          scored.map((c) => ({
            score: c.match.score,
            floorArea: c.profile.floorArea,
            heatPump: c.heatPump,
            designTemperature: designTemperatureFor(c.share?.postcodeDistrict),
          })),
          designTemperatureFor(home.postcodeDistrict),
        )
      : null

  return (
    <div className="matches-page">
      <div className="page-back">
        <button className="link" onClick={onBack}>
          ← What next?
        </button>
      </div>
      <YourHome profile={profile} onFabric={onFabric} />

      <section className="matches">
        <div className="matches-heading">
          <h2>Similar homes</h2>
          <button className="button subtle" onClick={() => setReload((n) => n + 1)}>
            Refresh
          </button>
        </div>
        <p className="muted">
          Matched on size, layout, outside wall, windows and storeys, and on how it’s built and your area’s winter
          temperature where you and the owner have said. Their floorplan is drawn dashed over yours.
          {surveyId ? '' : ' Your scan stays in this browser: other homes are compared with it here.'}
        </p>

        {state.status === 'loading' && <p className="muted">Finding homes to compare…</p>}
        {state.status === 'error' && (
          <p className="error" role="alert">
            Couldn't load other homes. Try Refresh.
          </p>
        )}
        {candidates?.length === 0 && (
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
