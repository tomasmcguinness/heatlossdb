import { useEffect, useState } from 'react'
import { isAuthConfigured } from '../auth'
import { listHomes, type SavedHomeSummary } from '../share/homes'
import { useAccount } from './useAccount'

type Homes = { state: 'loading' } | { state: 'loaded'; homes: SavedHomeSummary[] } | { state: 'failed' }

const savedOn = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The homes the signed-in user has saved, each opening its survey. */
export function MyHomesPage() {
  const { isSignedIn, openSignIn } = useAccount()
  const [homes, setHomes] = useState<Homes>({ state: 'loading' })

  useEffect(() => {
    if (!isSignedIn) return
    let current = true
    listHomes()
      .then((list) => current && setHomes({ state: 'loaded', homes: list }))
      .catch(() => current && setHomes({ state: 'failed' }))
    return () => {
      current = false
    }
  }, [isSignedIn])

  return (
    <div className="explore-page my-homes">
      <div className="page-back">
        <a className="link" href="/">
          ← Open a scan
        </a>
      </div>
      <h2>My homes</h2>

      {!isAuthConfigured ? (
        <p className="muted">Sign-in isn't set up on this site.</p>
      ) : isSignedIn === undefined ? null : !isSignedIn ? (
        <div className="card">
          <p>Sign in to see the homes you've saved.</p>
          <div>
            <button className="button" onClick={openSignIn}>
              Sign in
            </button>
          </div>
        </div>
      ) : homes.state === 'loading' ? (
        <p className="muted">Loading your homes…</p>
      ) : homes.state === 'failed' ? (
        <p className="error" role="alert">
          Couldn't load your homes. Reload the page to try again.
        </p>
      ) : homes.homes.length === 0 ? (
        <p className="muted">
          You haven't saved any homes yet. Open a scan, then choose <strong>Save</strong> at the top right of the editor.
        </p>
      ) : (
        <ul className="my-homes-list">
          {homes.homes.map((home) => (
            <li key={home.id}>
              <a className="card my-home" href={`/s/${home.id}`}>
                <span className="my-home-name">{home.name}</span>
                <span className="muted small">Saved {savedOn(home.savedAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
