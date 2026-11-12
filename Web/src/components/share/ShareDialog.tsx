import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFabric, type EditedRoom } from '../../fabric/store'
import { answeredCount, isHomeFabricSet, QUESTION_COUNT } from '../../fabric/home'
import { listingName } from '../../share/listing'
import { createAccount, resendConfirmation, saveShare, submitShare, useShare } from '../../share/share'
import { CheckIcon } from '../editor/icons'

type Step = 'check' | 'account' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'check', label: 'Check' },
  { id: 'account', label: 'Account' },
  { id: 'done', label: 'Done' },
]

// Enough to catch typos; Clerk checks the address properly by emailing it.
const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

interface ShareDialogProps {
  /** Every room still in the home (removed ones left out). */
  rooms: EditedRoom[]
  onClose: () => void
  /** Closes the dialog and opens Home fabric. */
  onFabric: () => void
  /** Closes the dialog and takes the user to the first room still to check. */
  onCheckRooms: () => void
}

/** Share your home: checks the scan is ready, creates an account, then waits for its email to
 *  be confirmed before the home is listed. */
export function ShareDialog({ rooms, onClose, onFabric, onCheckRooms }: ShareDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const scanHash = useFabric((s) => s.scan?.hash)
  const home = useFabric((s) => s.home)
  const shared = useShare()
  const [step, setStep] = useState<Step>(shared ? 'done' : 'check')
  const [agreed, setAgreed] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const fabricSet = isHomeFabricSet(home)
  const answered = answeredCount(home)
  const checked = rooms.filter((r) => r.checked).length
  const roomsChecked = rooms.length > 0 && checked === rooms.length
  const ready = fabricSet && roomsChecked
  const name = listingName(home)
  const close = () => dialog.current?.close()

  const createAndShare = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (!looksLikeEmail(address)) {
      setError('Enter an email address, like name@example.com.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await createAccount(address)
      await submitShare(name)
      if (scanHash) saveShare(scanHash, { status: 'pending', email: address, name, sharedAt: new Date().toISOString() })
      setStep('done')
    } catch {
      setError('Couldn’t create your account. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    // Escape closes the dialog itself; onClose keeps the editor in step.
    <dialog ref={dialog} className="share-dialog" aria-labelledby="share-title" onClose={onClose}>
      <header className="share-head">
        <h2 id="share-title">Share your home</h2>
        <button className="icon-only" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>

      <ol className="share-steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={s.id === step ? 'on' : ''} aria-current={s.id === step ? 'step' : undefined}>
            <span className="share-step-number">{i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {step === 'check' && (
        <div className="share-body">
          <p className="muted">Before your home is shared, make sure the scan is right. Others will use it to size their heat pumps.</p>
          <ul className="share-checks">
            <li className={fabricSet ? 'ok' : ''}>
              <span className="share-check-mark">{fabricSet && <CheckIcon />}</span>
              <span className="share-check-text">
                <strong>Home fabric</strong>
                <span className="small muted">
                  {fabricSet
                    ? `${answered} of ${QUESTION_COUNT} questions answered${answered < QUESTION_COUNT ? '. The rest use typical values' : ''}.`
                    : 'Not set. Answer a few quick questions about how your home is built.'}
                </span>
              </span>
              <button className="button subtle" onClick={onFabric}>
                {fabricSet ? 'Edit' : 'Set home fabric'}
              </button>
            </li>
            <li className={roomsChecked ? 'ok' : ''}>
              <span className="share-check-mark">{roomsChecked && <CheckIcon />}</span>
              <span className="share-check-text">
                <strong>Every room checked</strong>
                <span className="small muted">
                  {checked} of {rooms.length} rooms checked.
                </span>
              </span>
              {!roomsChecked && rooms.length > 0 && (
                <button className="button subtle" onClick={onCheckRooms}>
                  Check rooms
                </button>
              )}
            </li>
          </ul>

          {ready && (
            <>
              <div className="share-listing">
                <span className="small muted">Your home will appear in search as</span>
                <strong>{name}</strong>
                <span className="small muted">Your full postcode, address and email are never shown.</span>
              </div>
              <label className="share-consent">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>I’m happy with my scan and agree to share it and my home’s details anonymously.</span>
              </label>
            </>
          )}

          <div className="share-actions">
            <button className="button subtle" onClick={close}>
              Cancel
            </button>
            <button className="button" disabled={!ready || !agreed} onClick={() => setStep('account')}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'account' && (
        <form className="share-body" onSubmit={createAndShare} noValidate>
          <p className="muted">Create a free account, so you can update or remove your home later.</p>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'share-error' : 'share-email-note'}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error ? (
            <p id="share-error" className="share-error" role="alert">
              {error}
            </p>
          ) : (
            <p id="share-email-note" className="small muted">
              We’ll email you a link to confirm your account. Your home appears in search once you’ve confirmed.
            </p>
          )}
          <div className="share-actions">
            <button type="button" className="button subtle" onClick={() => setStep('check')}>
              Back
            </button>
            <button type="submit" className="button" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && shared && (
        <div className="share-body">
          <h3>Check your email</h3>
          <p>
            We’ve sent a link to <strong>{shared.email}</strong>. Once you’ve confirmed your account, your home will appear in
            search as <strong>{shared.name}</strong>.
          </p>
          <p className="muted">Until then it’s pending. You can carry on checking and editing your scan.</p>
          <div className="share-actions">
            <button className="button subtle" disabled={resent} onClick={() => void resendConfirmation(shared.email).then(() => setResent(true))}>
              {resent ? 'Email sent' : 'Resend email'}
            </button>
            <button className="button" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
