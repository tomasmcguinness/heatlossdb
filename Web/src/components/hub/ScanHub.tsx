import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { isAuthConfigured } from '../../auth'
import { useFabric } from '../../fabric/store'
import type { Feature } from '../../features'
import { useShare } from '../../share/share'
import { AccountButton } from '../AccountButton'
import { Brand } from '../Brand'
import { CheckIcon } from '../editor/icons'
import { useEditorFloors } from '../editor/model'
import { ScanEditor } from '../editor/ScanEditor'
import { useAccount, useComingSoon } from '../useAccount'

export type HubTab = 'view' | 'share' | 'compare'
type Tab = HubTab

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const icon = (paths: ReactNode) => (
  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
)

const TABS: { id: Tab; label: string; sub: string; icon: ReactNode; feature?: Feature }[] = [
  {
    id: 'view',
    label: 'View',
    sub: 'Check and edit your floor plan and rooms',
    icon: icon(
      <>
        <path d="M2 12 C4.5 7 8 4.5 12 4.5 C16 4.5 19.5 7 22 12 C19.5 17 16 19.5 12 19.5 C8 19.5 4.5 17 2 12 Z" />
        <circle cx="12" cy="12" r="3.5" />
      </>,
    ),
  },
  {
    id: 'share',
    label: 'Share',
    sub: 'Add your home to the database',
    feature: 'share',
    icon: icon(
      <>
        <path d="M3 11 L12 3.5 L21 11" />
        <path d="M5.5 9 V20.5 H18.5 V9" />
        <path d="M12 17 V10.5" />
        <path d="M9.25 13 L12 10.25 L14.75 13" />
      </>,
    ),
  },
  {
    id: 'compare',
    label: 'Compare',
    sub: 'See how similar homes perform',
    feature: 'search',
    icon: icon(
      <>
        <rect x="3" y="7" width="7" height="13" rx="1" />
        <rect x="14" y="4" width="7" height="16" rx="1" />
        <path d="M10 13.5 H14" />
      </>,
    ),
  },
]

interface ScanHubProps {
  tab: Tab
  onTab: (tab: Tab) => void
  /** Opens the matches for this home. */
  onSearch: () => void
  /** Opens Explore the database. */
  onExplore: () => void
}

/** Where an opened scan lands: View, Share and Compare as tabs down the side. View is the floor
 *  plan editor. */
export function ScanHub({ tab, onTab, onSearch, onExplore }: ScanHubProps) {
  const scanName = useFabric((s) => s.scanName)
  const floors = useEditorFloors()
  // Start sharing opens View with Share open, once: leaving View forgets it.
  const [shareOnOpen, setShareOnOpen] = useState(false)
  const setTab = (next: Tab) => {
    setShareOnOpen(false)
    onTab(next)
  }
  const startSharing = () => {
    setShareOnOpen(true)
    onTab('view')
  }
  const tabList = useRef<HTMLDivElement>(null)
  const isComingSoon = useComingSoon()

  // Up and down (or left and right) move between the tabs, as in any tab list.
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + step + TABS.length) % TABS.length]
    setTab(next.id)
    tabList.current?.querySelector<HTMLButtonElement>(`#hub-tab-${next.id}`)?.focus()
  }

  return (
    <div className="hub">
      <header className="hub-head">
        <Brand />
        <span className="editor-divider" aria-hidden="true" />
        <span className="hub-scan">
          <CheckIcon />
          <span>
            {[scanName ?? 'Your scan', plural(floors.length, 'floor'), plural(floors.flatMap((f) => f.rooms).length, 'room')].join(' · ')}
          </span>
        </span>
        <a className="hub-other" href="/new">
          Open a different scan
        </a>
        <AccountButton />
      </header>

      <div className="hub-body">
        <nav className="hub-nav" aria-label="Your scan">
          <div ref={tabList} role="tablist" aria-orientation="vertical" aria-label="What to do with your scan" onKeyDown={onKeyDown}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`hub-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="hub-panel"
                tabIndex={tab === t.id ? 0 : -1}
                className={`hub-tab${tab === t.id ? ' on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="hub-tab-icon">{t.icon}</span>
                <span className="hub-tab-text">
                  <span className="hub-tab-label">
                    {t.label}
                    {t.feature && isComingSoon(t.feature) && <span className="soon-badge">Coming soon</span>}
                  </span>
                  <span className="hub-tab-sub">{t.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <section id="hub-panel" className={`hub-panel${tab === 'view' ? ' hub-panel-editor' : ''}`} role="tabpanel" aria-labelledby={`hub-tab-${tab}`}>
          {tab === 'view' && (
            <ScanEditor
              onSearch={onSearch}
              onExplore={onExplore}
              startSharing={shareOnOpen}
              // Share started from the Share tab goes back there when it's closed.
              onShareClosed={() => setTab('share')}
            />
          )}
          {tab === 'share' && <SharePanel onShare={startSharing} />}
          {tab === 'compare' && <ComparePanel onCompare={onSearch} onShareTab={() => setTab('share')} />}
        </section>
      </div>
    </div>
  )
}

const SHARE_STEPS = [
  { step: 'Step 1', title: 'Free account', text: 'So you can update your home or its link later' },
  { step: 'Step 2', title: 'Check your scan', text: 'A few questions about how it’s built, and every room checked' },
  { step: 'Step 3 · optional', title: 'Heat pump', text: 'Make and model, output and design figures' },
  { step: 'Step 4', title: 'Share', text: 'Get a link to your home to send to anyone' },
]

function SharePanel({ onShare }: { onShare: () => void }) {
  const shared = useShare()
  const { isSignedIn, openSignIn } = useAccount()
  const isComingSoon = useComingSoon()
  const soon = isComingSoon('share')
  // Sharing needs an account: Start sharing while signed out signs in first, then carries on.
  const afterSignIn = useRef(false)

  useEffect(() => {
    if (!afterSignIn.current || !isSignedIn) return
    afterSignIn.current = false
    onShare()
  }, [isSignedIn, onShare])

  const start = () => {
    if (isSignedIn) return onShare()
    afterSignIn.current = true
    openSignIn()
  }

  return (
    <>
      <div className="hub-intro">
        <h1>
          Share your home
          {soon && <span className="soon-badge">Coming soon</span>}
        </h1>
        <p className="muted hub-lead">
          Add your floor plan to the database so people with similar homes can see real heat loss and heat pump sizing. It takes
          about five minutes.
        </p>
      </div>
      <ol className="hub-steps">
        {SHARE_STEPS.map((s) => (
          <li key={s.title} className="hub-card">
            <span className="hub-step">{s.step}</span>
            <strong>{s.title}</strong>
            <span className="muted small">{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="hub-lists">
        <div className="hub-card">
          <h2 className="hub-shared">Shared</h2>
          <ul>
            <li>Floor plan and room sizes</li>
            <li>Postcode district, such as B91</li>
            <li>Age, type and construction</li>
            <li>Heat loss and heat pump details</li>
          </ul>
        </div>
        <div className="hub-card">
          <h2 className="hub-never">Never shown</h2>
          <ul>
            <li>Your address or full postcode</li>
            <li>Your name or email</li>
            <li>Your room names</li>
          </ul>
        </div>
      </div>
      <div className="hub-cta">
        {shared ? (
          <>
            <button type="button" className="button hub-go" disabled={soon} onClick={onShare}>
              See your link
            </button>
            <span className="muted">
              Shared as <strong>{shared.name}</strong>.
            </span>
          </>
        ) : (
          <>
            <button type="button" className="button hub-go" disabled={soon || !isAuthConfigured} onClick={start}>
              Start sharing
              <ArrowIcon />
            </button>
            {!isAuthConfigured ? (
              <span className="muted small">Sign-in isn’t set up on this site.</span>
            ) : (
              !isSignedIn && <span className="badge-account">Free account required</span>
            )}
          </>
        )}
      </div>
    </>
  )
}

function ComparePanel({ onCompare, onShareTab }: { onCompare: () => void; onShareTab: () => void }) {
  const isComingSoon = useComingSoon()
  const soon = isComingSoon('search')
  return (
    <>
      <div className="hub-intro">
        <h1>
          Compare with similar homes
          {soon && <span className="soon-badge">Coming soon</span>}
        </h1>
        <p className="muted hub-lead">
          We’ll match your footprint, age and construction against shared homes, and show their heat loss, heat pump sizes and how
          they actually perform.
        </p>
      </div>
      {soon ? (
        <>
          <div className="hub-card hub-narrow">
            <p className="muted">Comparisons open once there are enough homes to give useful matches.</p>
          </div>
          {!isComingSoon('share') && (
            <div className="hub-cta">
              <button type="button" className="button hub-go" onClick={onShareTab}>
                Share yours to help
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="hub-cta">
          <button type="button" className="button hub-go" onClick={onCompare}>
            Find similar homes
            <ArrowIcon />
          </button>
        </div>
      )}
    </>
  )
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12 H19" />
      <path d="M13 6 L19 12 L13 18" />
    </svg>
  )
}
