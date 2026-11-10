import { useState, type ReactNode } from 'react'
import { useFabric } from '../fabric/store'
import type { ShapeProfile } from '../match/profile'
import { uprightRotation } from '../match/similarity'
import { closeScan } from './files'
import { PlanSvg } from './PlanSvg'

type Choice = 'view' | 'search' | 'share' | 'explore'

interface Option {
  id: Choice
  title: string
  text: string
  icon: ReactNode
  badge?: { label: string; kind: 'free' | 'account' }
  /** Shown but not choosable until enough homes are shared. */
  comingSoon?: boolean
}

const icon = (paths: ReactNode) => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
)

const OPTIONS: Option[] = [
  {
    id: 'view',
    title: 'View my scan',
    text: 'Just looking? See your floor plan, rooms and measurements. Nothing is saved or shared.',
    icon: icon(
      <>
        <path d="M2 12 C4.5 7 8 4.5 12 4.5 C16 4.5 19.5 7 22 12 C19.5 17 16 19.5 12 19.5 C8 19.5 4.5 17 2 12 Z" />
        <circle cx="12" cy="12" r="3.5" />
      </>,
    ),
    badge: { label: 'No account needed', kind: 'free' },
  },
  {
    id: 'search',
    title: 'Find similar homes',
    text: 'Match your footprint, age and construction against shared homes, and see their heat loss and heat pump sizing.',
    icon: icon(
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 L21 21" />
        <path d="M7.5 11 L10.5 8.5 L13.5 11 V13.5 H7.5 Z" />
      </>,
    ),
    comingSoon: true,
  },
  {
    id: 'share',
    title: 'Share your home',
    text: 'Add your floor plan and heat pump details to the database so others with similar homes can learn from it.',
    icon: icon(
      <>
        <path d="M3 11 L12 3.5 L21 11" />
        <path d="M5.5 9 V20.5 H18.5 V9" />
        <path d="M12 17 V10.5" />
        <path d="M9.25 13 L12 10.25 L14.75 13" />
      </>,
    ),
    //badge: { label: 'Free account required', kind: 'account' },
    comingSoon: true,
  },
  {
    id: 'explore',
    title: 'Explore the database',
    text: 'Browse shared homes by area, age and property type, and compare how their heat pumps perform.',
    icon: icon(
      <>
        <path d="M3 6.5 L9 4 L15 6.5 L21 4 V17.5 L15 20 L9 17.5 L3 20 Z" />
        <path d="M9 4 V17.5" />
        <path d="M15 6.5 V20" />
      </>,
    ),
    comingSoon: true,
  },
]

const HINTS: Record<Choice, string> = {
  view: 'Your scan stays in this browser only. You can search or share it later.',
  search: 'Next, a few quick questions about your home: postcode, age and type, and how it’s built.',
  share: 'Next, a few quick questions about your home. You’ll create a free account before your floor plan is saved.',
  explore: 'Your scan stays loaded, so you can search or share it at any point.',
}

const ACTIONS: Record<Choice, string> = {
  view: 'View floor plan',
  search: 'Continue',
  share: 'Continue',
  explore: 'Start exploring',
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Shown once a scan is open: what the scan is, and the choice of what to do with it. */
export function WhatNext({ profile, onView }: { profile: ShapeProfile | null; onView: () => void }) {
  const scan = useFabric((s) => s.scan)
  const scanName = useFabric((s) => s.scanName)
  const [picked, setPicked] = useState<Choice>('view')
  if (!scan) return null

  const facts = [
    plural(scan.stories.length, 'floor'),
    scan.sections.length > 0 && plural(scan.sections.length, 'room'),
    profile && `${Math.round(profile.floorArea)} m² floor area`,
  ].filter(Boolean)

  // Only viewing exists so far; the share flow comes next.
  const ready = picked === 'view'

  return (
    <main className="what-next">
      <section className="card scan-loaded" aria-label="Uploaded scan">
        {profile && profile.plans.length > 0 && (
          <div className="scan-loaded-plan">
            <PlanSvg storeys={profile.plans} rotation={uprightRotation(profile.plans)} title="Floor plan preview" />
          </div>
        )}
        <div className="scan-loaded-text">
          <p className="scan-loaded-status">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5 L6.5 12 L13 4.5" />
            </svg>
            Scan loaded
          </p>
          <h1>{scanName ?? 'Your scan'}</h1>
          <p className="muted">{facts.join(' · ')}</p>
        </div>
        <button className="link" onClick={closeScan}>
          Open a different scan
        </button>
      </section>

      <section className="next-choices" aria-labelledby="next-title">
        <div className="next-intro">
          <h2 id="next-title">What next?</h2>
          <p className="muted">Choose what you’d like to do with your floor plan. You can come back and do the others later.</p>
        </div>

        <div className="next-options" role="radiogroup" aria-labelledby="next-title">
          {OPTIONS.map((option) => (
            <label key={option.id} className={`next-option${option.comingSoon ? ' coming-soon' : ''}`}>
              <input
                type="radio"
                name="what-next"
                className="visually-hidden"
                value={option.id}
                checked={picked === option.id}
                disabled={option.comingSoon}
                onChange={() => setPicked(option.id)}
              />
              <span className="next-option-top">
                <span className="next-option-icon">{option.icon}</span>
                <span className="next-option-dot" aria-hidden="true" />
              </span>
              <span className="next-option-title">{option.title}</span>
              <span className="next-option-text">{option.text}</span>
              {option.comingSoon ? (
                <span className="next-option-foot">
                  <span className="badge badge-soon">Coming soon</span>
                  <span className="small muted">Opens once enough homes are shared</span>
                </span>
              ) : (
                option.badge && (
                  <span className="next-option-foot">
                    <span className={`badge badge-${option.badge.kind}`}>{option.badge.label}</span>
                  </span>
                )
              )}
            </label>
          ))}
        </div>

        <div className="next-footer">
          <p className="muted">{HINTS[picked]}</p>
          <button className="button next-action" disabled={!ready} onClick={onView}>
            {ACTIONS[picked]}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12 H19" />
              <path d="M13 6 L19 12 L13 18" />
            </svg>
          </button>
        </div>
      </section>
    </main>
  )
}
