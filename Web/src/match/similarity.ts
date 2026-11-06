import { alignStorey, applyAlignment, dominantAngle, pivotOf, type StoreyAlignment } from '../scan/align'
import { overlap, type Point2 } from '../scan/outline'
import type { ShapeProfile } from './profile'

/** How another home's plan is placed over yours: optionally mirrored, then lined up. */
export interface Placement extends StoreyAlignment {
  mirrored: boolean
}

export interface Factor {
  key: 'size' | 'layout' | 'envelope' | 'glazing' | 'storeys' | 'party'
  label: string
  /** 0 (nothing alike) to 1 (the same). */
  similarity: number
  weight: number
  yours: string
  theirs: string
  /** False when neither home has the information (e.g. no party walls marked), so the factor
   *  says nothing about how alike they are. It's shown but doesn't count. */
  informative: boolean
}

export interface Match {
  /** 0–100. */
  score: number
  factors: Factor[]
  placement: Placement
}

/**
 * How much each factor counts. Size and layout dominate because they set how much envelope a
 * home has; fabric will join these once owners describe it. To be tuned against measured heat
 * demand once there's enough data.
 */
const WEIGHTS: Record<Factor['key'], number> = {
  size: 0.25,
  layout: 0.3,
  envelope: 0.2,
  glazing: 0.1,
  storeys: 0.1,
  party: 0.05,
}

/** 1 when equal, falling to 0 when one is double (or half) the other. */
function ratioSimilarity(a: number, b: number): number {
  if (a <= 0 || b <= 0) return a === b ? 1 : 0
  return Math.max(0, 1 - Math.abs(Math.log(a / b)) / Math.log(2))
}

/** 1 when equal, falling to 0 when they differ by half the larger. */
function relativeSimilarity(a: number, b: number): number {
  const larger = Math.max(Math.abs(a), Math.abs(b))
  return larger === 0 ? 1 : Math.max(0, 1 - Math.abs(a - b) / larger / 0.5)
}

const mirror = (plans: Point2[][][]): Point2[][][] =>
  plans.map((storey) => storey.map((outline) => outline.map(([x, z]): Point2 => [-x, z]).reverse()))

export function placePlans(plans: Point2[][][], placement: Placement): Point2[][][] {
  const source = placement.mirrored ? mirror(plans) : plans
  if (!source.length) return source
  // Every storey moves together, about the ground floor's centre.
  const pivot = pivotOf({ closed: source[0] } as never)
  return source.map((storey) => storey.map((outline) => applyAlignment(outline, pivot, placement)))
}

/** Mean overlap of the storeys both homes have, lowest first; the ground floor counts most. */
function layoutOverlap(yours: Point2[][][], theirs: Point2[][][]): number {
  const shared = Math.min(yours.length, theirs.length)
  if (!shared) return 0
  let total = 0
  let weights = 0
  for (let i = 0; i < shared; i++) {
    const weight = i === 0 ? 2 : 1
    total += weight * overlap(yours[i], theirs[i])
    weights += weight
  }
  return total / weights
}

/** Lines their plan up with yours (trying a mirror image too, as semis are often mirrored). */
function bestPlacement(yours: ShapeProfile, theirs: ShapeProfile): { placement: Placement; overlap: number } {
  let best = { placement: { mirrored: false, rotation: 0, dx: 0, dz: 0 }, overlap: -1 }
  if (!yours.plans.length || !theirs.plans.length) return { ...best, overlap: 0 }
  for (const mirrored of [false, true]) {
    const source = mirrored ? mirror(theirs.plans) : theirs.plans
    const { rotation, dx, dz } = alignStorey(source[0], yours.plans[0])
    const placement = { mirrored, rotation, dx, dz }
    const score = layoutOverlap(yours.plans, placePlans(theirs.plans, placement))
    if (score > best.overlap) best = { placement, overlap: score }
  }
  return best
}

const m2 = (v: number) => `${Math.round(v)} m²`
const percent = (v: number) => `${Math.round(v * 100)}%`

export function compare(yours: ShapeProfile, theirs: ShapeProfile): Match {
  const { placement, overlap: layout } = bestPlacement(yours, theirs)

  const envelope = (p: ShapeProfile) => (p.floorArea ? p.externalWallArea / p.floorArea : 0)
  const glazing = (p: ShapeProfile) => (p.floorArea ? p.windowArea / p.floorArea : 0)
  const party = (p: ShapeProfile) => {
    const walls = p.externalWallArea + p.partyWallArea
    return walls ? p.partyWallArea / walls : 0
  }
  const storeyDifference = Math.abs(yours.storeys - theirs.storeys)

  const factors: Factor[] = [
    {
      key: 'size',
      label: 'Floor area',
      similarity: ratioSimilarity(yours.floorArea, theirs.floorArea),
      weight: WEIGHTS.size,
      informative: true,
      yours: m2(yours.floorArea),
      theirs: m2(theirs.floorArea),
    },
    {
      key: 'layout',
      label: 'Layout',
      similarity: layout,
      weight: WEIGHTS.layout,
      informative: true,
      yours: 'Your plan',
      theirs: `${percent(layout)} overlap${placement.mirrored ? ', mirrored' : ''}`,
    },
    {
      key: 'envelope',
      label: 'Outside wall per m² of floor',
      similarity: relativeSimilarity(envelope(yours), envelope(theirs)),
      weight: WEIGHTS.envelope,
      informative: true,
      yours: `${envelope(yours).toFixed(2)} m²`,
      theirs: `${envelope(theirs).toFixed(2)} m²`,
    },
    {
      key: 'glazing',
      label: 'Window area to floor area',
      similarity: relativeSimilarity(glazing(yours), glazing(theirs)),
      weight: WEIGHTS.glazing,
      informative: true,
      yours: percent(glazing(yours)),
      theirs: percent(glazing(theirs)),
    },
    {
      key: 'storeys',
      label: 'Storeys',
      similarity: storeyDifference === 0 ? 1 : storeyDifference === 1 ? 0.4 : 0,
      weight: WEIGHTS.storeys,
      informative: true,
      yours: String(yours.storeys),
      theirs: String(theirs.storeys),
    },
    {
      key: 'party',
      label: 'Wall shared with neighbours',
      similarity: 1 - Math.abs(party(yours) - party(theirs)),
      weight: WEIGHTS.party,
      yours: yours.partyWallArea ? percent(party(yours)) : 'None marked',
      theirs: theirs.partyWallArea ? percent(party(theirs)) : 'None marked',
      informative: yours.partyWallArea > 0 || theirs.partyWallArea > 0,
    },
  ]

  // Weighted average over the factors that carry information.
  const counted = factors.filter((f) => f.informative)
  const totalWeight = counted.reduce((sum, f) => sum + f.weight, 0)
  const score = Math.round((100 * counted.reduce((sum, f) => sum + f.weight * f.similarity, 0)) / totalWeight)
  return { score, factors, placement }
}

/** Turns plans so the building's main walls run across and down the screen. */
export function uprightRotation(plans: Point2[][][]): number {
  return plans.length ? -dominantAngle(plans[0]) : 0
}

/** A one-line reason: what's most alike, and the biggest difference if there is one. */
export function summarise(match: Match): string {
  const counted = match.factors.filter((f) => f.informative)
  const ranked = [...counted].sort((a, b) => b.similarity * b.weight - a.similarity * a.weight)
  const alike = ranked.filter((f) => f.similarity >= 0.85).slice(0, 2)
  const different = [...counted].sort((a, b) => a.similarity - b.similarity)[0]
  const parts: string[] = []
  if (alike.length) parts.push(`Similar ${alike.map((f) => f.label.toLowerCase()).join(' and ')}`)
  if (different && different.similarity < 0.6) {
    parts.push(`${different.label.toLowerCase()} differs (${different.yours} vs ${different.theirs})`)
  }
  const text = parts.join('; ') || 'Some similarities'
  return text.charAt(0).toUpperCase() + text.slice(1)
}
