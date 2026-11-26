import { useEffect, useState } from 'react'
import { loadAdminSurvey, type AdminSurvey } from '../admin/admin'
import { Brand } from './Brand'
import { BackIcon } from './editor/icons'
import { SharedHomeView } from './SharedHomePage'
import { useAccount } from './useAccount'

const uploadedOn = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A survey opened from the Admin portal (/admin/s/<id>), to look at only: drawn as a shared home is,
 * with its current floor plan and its owner's saved edits (or the scan as uploaded, if nobody has
 * saved it). Kept apart from the editor, so the admin's own open scan is left as it was.
 */
export function AdminSurveyPage({ surveyId }: { surveyId: string }) {
  const { isSignedIn, openSignIn } = useAccount()
  const [survey, setSurvey] = useState<AdminSurvey | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Only once Clerk has loaded and the admin is signed in: the API needs their token.
  useEffect(() => {
    if (!isSignedIn) return
    loadAdminSurvey(surveyId)
      .then(setSurvey)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [surveyId, isSignedIn])

  if (isSignedIn === false) {
    return (
      <div className="app">
        <header className="topbar">
          <Brand />
        </header>
        <div className="dropzone">
          <p>Sign in to use the Admin portal.</p>
          <button className="button" onClick={openSignIn}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  if (error || !survey) {
    return (
      <div className="app">
        <header className="topbar">
          <Brand />
        </header>
        <div className="dropzone">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <a className="button" href="/admin">
                Back to the Admin portal
              </a>
            </>
          ) : (
            <p className="muted">Opening survey…</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <SharedHomeView
      home={survey.home}
      status={
        <>
          <span className="muted small">
            Admin view · uploaded {uploadedOn(survey.createdAt)}
            {survey.hasEdits ? ' · owner’s edits' : ' · not saved by anyone'}
          </span>
          <a className="button subtle" href="/admin">
            <BackIcon />
            All surveys
          </a>
        </>
      }
    />
  )
}
