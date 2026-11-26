import { useEffect, useState } from 'react'
import { AdminError, listAllSurveys, type AdminSurveySummary } from '../admin/admin'
import { isAuthConfigured } from '../auth'
import { useAccount } from './useAccount'

type Surveys = { state: 'loading' } | { state: 'loaded'; surveys: AdminSurveySummary[] } | { state: 'failed'; message: string }

const uploadedOn = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const kilobytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`

/** The Admin portal: every uploaded survey, newest first, each opening read-only. */
export function AdminPage() {
  const { isSignedIn, isAdmin, openSignIn } = useAccount()
  const [surveys, setSurveys] = useState<Surveys>({ state: 'loading' })

  useEffect(() => {
    if (!isSignedIn || !isAdmin) return
    let current = true
    listAllSurveys()
      .then((list) => current && setSurveys({ state: 'loaded', surveys: list }))
      .catch((e: unknown) => current && setSurveys({ state: 'failed', message: e instanceof AdminError ? e.message : 'Couldn’t load the surveys.' }))
    return () => {
      current = false
    }
  }, [isSignedIn, isAdmin])

  return (
    <div className="explore-page my-homes">
      <div className="my-homes-head">
        <h2>Admin portal</h2>
        {surveys.state === 'loaded' && (
          <span className="muted">
            {surveys.surveys.length} {surveys.surveys.length === 1 ? 'survey' : 'surveys'}
          </span>
        )}
      </div>

      {!isAuthConfigured ? (
        <p className="muted">Sign-in isn't set up on this site.</p>
      ) : isSignedIn === undefined ? null : !isSignedIn ? (
        <div className="card">
          <p>Sign in to use the Admin portal.</p>
          <div>
            <button className="button" onClick={openSignIn}>
              Sign in
            </button>
          </div>
        </div>
      ) : !isAdmin ? (
        <p className="muted">You don't have access to this page.</p>
      ) : surveys.state === 'loading' ? (
        <p className="muted">Loading surveys…</p>
      ) : surveys.state === 'failed' ? (
        <p className="error" role="alert">
          {surveys.message}
        </p>
      ) : surveys.surveys.length === 0 ? (
        <p className="muted">Nobody has uploaded a survey yet.</p>
      ) : (
        <ul className="my-homes-list">
          {surveys.surveys.map((survey) => (
            <li key={survey.id}>
              <a className="card my-home" href={`/admin/s/${survey.id}`}>
                <span className="my-home-name">{survey.name ?? <span className="muted">Unnamed survey</span>}</span>
                <span className="muted small">
                  Uploaded {uploadedOn(survey.createdAt)} · {kilobytes(survey.sizeBytes)} · <code>{survey.id}</code>
                </span>
                <span>
                  {survey.owned ? <span className="tag tag-set">Saved</span> : <span className="tag">Not saved</span>}{' '}
                  {survey.isShared && <span className="tag tag-set">Shared</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
