import { useEffect, useRef, useState, type DragEvent } from 'react'
import { isAuthConfigured } from '../auth'
import { errorMessage, isValidCode, normaliseCode, openFile, surveyIdForCode, surveyIdFromPath } from './files'
import { useAccount, useComingSoon } from './useAccount'

/** A pasted survey link (…/s/<id>) opens that survey; anything else is read as a code. */
function surveyLinkIn(text: string): string | null {
  const path = /\/s\/[A-Za-z0-9_-]{22}\/?$/.exec(text.trim())?.[0]
  return path ? surveyIdFromPath(path) : null
}

/**
 * Where everyone starts: open a scan, by its code from the app or its file, or explore the
 * database. Signing in from here leads on to the scans you've saved.
 */
export function LandingPage({ error, onError }: { error: string | null; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [code, setCode] = useState('')
  const [checkingCode, setCheckingCode] = useState(false)
  const { isSignedIn, openSignIn } = useAccount()
  const [signingIn, setSigningIn] = useState(false)
  const typed = normaliseCode(code)
  const exploreSoon = useComingSoon()('explore')

  useEffect(() => {
    if (signingIn && isSignedIn) location.assign('/scans')
  }, [signingIn, isSignedIn])

  const open = async (file: File | undefined) => {
    if (!file) return
    try {
      onError(null)
      await openFile(file)
    } catch (e) {
      onError(errorMessage(e))
    }
  }

  const openCode = async (value: string) => {
    const link = surveyLinkIn(value)
    if (link) {
      location.assign(`/s/${link}`)
      return
    }
    const tidy = normaliseCode(value)
    if (!isValidCode(tidy)) {
      onError('Codes are 5 letters and numbers, as shown in the app after uploading.')
      return
    }
    setCheckingCode(true)
    try {
      onError(null)
      // The survey's own link, so it can be bookmarked and reloaded once the code has expired.
      location.assign(`/s/${await surveyIdForCode(tidy)}`)
    } catch (e) {
      onError(errorMessage(e))
      setCheckingCode(false)
    }
  }

  const dragProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: DragEvent) => {
      // Only when leaving the card, not moving between its children.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void open(e.dataTransfer.files[0])
    },
  }

  return (
    <main className="landing">
      <div className="landing-intro">
        <h1>Real heat loss data from real UK homes</h1>
        <p className="muted">
          Floorplans scanned with the HeatLossDB app, combined with heat loss calculations and heat pump details shared by homeowners.
        </p>
      </div>

      <nav className="landing-cards" aria-label="Get started">
        <section className={`landing-card${dragging ? ' dragging' : ''}`} aria-labelledby="open-title" {...dragProps}>
          <span className="landing-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3 H6 V21 H18 V7 Z" />
              <path d="M14 3 V7 H18" />
              <path d="M12 17 V11" />
              <path d="M9.5 13.5 L12 11 L14.5 13.5" />
            </svg>
          </span>
          <h2 id="open-title">Open a scan</h2>

          <form
            className="landing-code"
            onSubmit={(e) => {
              e.preventDefault()
              void openCode(code)
            }}
          >
            <label htmlFor="scan-code">Enter the code from the app</label>
            <span className="landing-code-row">
              <input
                id="scan-code"
                className="landing-code-input"
                placeholder="A7K3P"
                value={code}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="code-help"
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  const value = e.target.value
                  // A pasted link keeps its case; a code is shown in capitals.
                  setCode(surveyLinkIn(value) ? value : value.toUpperCase())
                  // A whole code or a pasted link opens straight away; Open is still there to try again.
                  if (!checkingCode && (surveyLinkIn(value) || isValidCode(normaliseCode(value)))) void openCode(value)
                }}
              />
              <button className="button" type="submit" disabled={checkingCode || !(isValidCode(typed) || surveyLinkIn(code))}>
                {checkingCode ? 'Opening…' : 'Open'}
              </button>
            </span>
            <span id="code-help" className="small muted">
              Shown in the app after you upload a scan. You can also paste the link.
            </span>
          </form>

          <p className="landing-or" aria-hidden="true">
            or
          </p>

          <div className="landing-drop">
            <button type="button" className="button subtle" onClick={() => input.current?.click()}>
              Choose a file
            </button>
            <span className="muted small">{dragging ? 'Drop to open your scan' : 'or drag your merged.json here'}</span>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void open(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="landing-foot">
            <span className="badge-free">No account needed to view</span>
            {isAuthConfigured && isSignedIn === false && (
              <span className="small muted">
                Saved a scan before?{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setSigningIn(true)
                    openSignIn()
                  }}
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </section>

        {exploreSoon ? (
          <section className="landing-card soon" aria-labelledby="explore-title">
            <ExploreCardBody soon />
          </section>
        ) : (
          <a className="landing-card" href="/explore" aria-labelledby="explore-title">
            <ExploreCardBody soon={false} />
          </a>
        )}
      </nav>

      <p className="muted small">Don’t have a scan yet? Scan your home with the HeatLossDB app, then upload it.</p>
    </main>
  )
}

function ExploreCardBody({ soon }: { soon: boolean }) {
  return (
    <>
      <span className="landing-card-top">
        <span className="landing-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6.5 L9 4 L15 6.5 L21 4 V17.5 L15 20 L9 17.5 L3 20 Z" />
            <path d="M9 4 V17.5" />
            <path d="M15 6.5 V20" />
          </svg>
        </span>
        {!soon && (
          <svg className="landing-arrow" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12 H19" />
            <path d="M13 6 L19 12 L13 18" />
          </svg>
        )}
      </span>
      <span id="explore-title" className="landing-card-title">
        Explore the database
      </span>
      <span className="muted">
        Browse shared homes by area, age and property type, and see their heat loss and how their heat pumps perform.
      </span>
      <span className="landing-foot">{soon ? <span className="soon-badge">Coming soon</span> : <span className="badge-free">No account needed</span>}</span>
    </>
  )
}
