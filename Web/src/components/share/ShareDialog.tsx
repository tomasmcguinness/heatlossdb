import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useFabric, type EditedRoom } from '../../fabric/store'
import { answeredCount, isHomeFabricSet, QUESTION_COUNT } from '../../fabric/home'
import { listingName } from '../../share/listing'
import { outwardCode } from '../../share/postcode'
import { createAccount, resendConfirmation, saveShare, submitShare, useShare } from '../../share/share'
import { EMPTY_HEAT_PUMP_FORM, heatPumpRecord, isHeatPumpFormEmpty, type HeatPumpForm } from '../../share/heatPumpForm'
import type { HeatPumpData } from '../../match/heatPump'
import { CheckIcon } from '../editor/icons'

type Step = 'check' | 'heatPump' | 'account' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'check', label: 'Check' },
  { id: 'heatPump', label: 'Heat pump' },
  { id: 'account', label: 'Account' },
  { id: 'done', label: 'Done' },
]

// Enough to catch typos; Clerk checks the address properly by emailing it.
const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

interface ShareDialogProps {
  /** Every room in the home. */
  rooms: EditedRoom[]
  onClose: () => void
  /** Closes the dialog and opens Home fabric. */
  onFabric: () => void
  /** Closes the dialog and takes the user to the first room still to check. */
  onCheckRooms: () => void
}

/** Share your home: checks the scan is ready, takes any heat pump figures, creates an account,
 *  then waits for its email to be confirmed before the home is listed. */
export function ShareDialog({ rooms, onClose, onFabric, onCheckRooms }: ShareDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const scanHash = useFabric((s) => s.scan?.hash)
  const home = useFabric((s) => s.home)
  const shared = useShare()
  const [step, setStep] = useState<Step>(shared ? 'done' : 'check')
  const [agreed, setAgreed] = useState(false)
  // Prefilled from Home fabric, where finding similar homes asks for it too.
  const [postcode, setPostcode] = useState(home.postcodeDistrict ?? '')
  const [postcodeTouched, setPostcodeTouched] = useState(false)
  // Room names can say who lives there ("Sophie’s room"), so they're hidden unless the owner says.
  const [shareRoomNames, setShareRoomNames] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [heatPumpForm, setHeatPumpForm] = useState<HeatPumpForm>(EMPTY_HEAT_PUMP_FORM)
  // Null when skipped.
  const [heatPump, setHeatPump] = useState<HeatPumpData | null>(null)
  const [heatPumpError, setHeatPumpError] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const fabricSet = isHomeFabricSet(home)
  const answered = answeredCount(home)
  const checked = rooms.filter((r) => r.checked).length
  const roomsChecked = rooms.length > 0 && checked === rooms.length
  const ready = fabricSet && roomsChecked
  const name = listingName(home)
  const postcodeDistrict = outwardCode(postcode)
  const postcodeError = postcodeTouched && !postcodeDistrict ? 'Enter the first part of your postcode, like SW1A or M1.' : null
  const close = () => dialog.current?.close()
  const setHeatPumpField = (field: keyof HeatPumpForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setHeatPumpForm((form) => ({ ...form, [field]: e.target.value }))

  const skipHeatPump = () => {
    setHeatPumpError(null)
    setHeatPump(null)
    setStep('account')
  }

  const continueFromHeatPump = (e: FormEvent) => {
    e.preventDefault()
    if (isHeatPumpFormEmpty(heatPumpForm)) {
      skipHeatPump()
      return
    }
    const result = heatPumpRecord(heatPumpForm)
    if ('error' in result) {
      setHeatPumpError(result.error)
      return
    }
    setHeatPumpError(null)
    setHeatPump(result.record)
    setStep('account')
  }

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
      await submitShare(name, { postcodeDistrict: postcodeDistrict!, shareRoomNames, home }, heatPump)
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
              <label className="field">
                <span className="field-label">First part of your postcode</span>
                <input
                  className="share-postcode"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="SW1A"
                  value={postcode}
                  aria-invalid={postcodeError ? true : undefined}
                  aria-describedby={postcodeError ? 'share-postcode-error' : 'share-postcode-note'}
                  onChange={(e) => setPostcode(e.target.value)}
                  onBlur={() => {
                    setPostcodeTouched(true)
                    // A full postcode is cut down here, so only the first part is ever kept.
                    if (postcodeDistrict) setPostcode(postcodeDistrict)
                  }}
                />
              </label>
              {postcodeError ? (
                <p id="share-postcode-error" className="share-error" role="alert">
                  {postcodeError}
                </p>
              ) : (
                <p id="share-postcode-note" className="small muted">
                  Just the area, so others can find homes in a similar climate.
                </p>
              )}
              <label className="share-consent">
                <input type="checkbox" checked={shareRoomNames} onChange={(e) => setShareRoomNames(e.target.checked)} />
                <span>
                  Show my room names
                  <span className="small muted share-consent-note">
                    Otherwise rooms are shown as Room 1, Room 2 and so on.
                  </span>
                </span>
              </label>
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
            <button className="button" disabled={!ready || !agreed || !postcodeDistrict} onClick={() => setStep('heatPump')}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'heatPump' && (
        <form className="share-body" onSubmit={continueFromHeatPump} noValidate>
          <p className="muted">
            If you have a heat pump, these figures make your home far more useful to others. Your installer’s heat loss report has
            them.
          </p>
          <label className="field">
            <span className="field-label">Heat pump make and model</span>
            <input
              autoFocus
              autoComplete="off"
              placeholder="Vaillant aroTHERM plus 7"
              value={heatPumpForm.makeAndModel}
              onChange={setHeatPumpField('makeAndModel')}
            />
          </label>
          <div className="share-field-row">
            <label className="field">
              <span className="field-label">Rated output (kW)</span>
              <input type="number" inputMode="decimal" step="any" value={heatPumpForm.outputKw} onChange={setHeatPumpField('outputKw')} />
            </label>
            <label className="field">
              <span className="field-label">Calculated heat loss (kW)</span>
              <input type="number" inputMode="decimal" step="any" value={heatPumpForm.heatLossKw} onChange={setHeatPumpField('heatLossKw')} />
            </label>
            <label className="field">
              <span className="field-label">Design outdoor temperature (°C)</span>
              {/* Text, not number: phone number pads often have no minus key, and this is usually below zero. */}
              <input
                inputMode="text"
                placeholder="−2"
                value={heatPumpForm.outdoorTemperature}
                onChange={setHeatPumpField('outdoorTemperature')}
              />
            </label>
          </div>
          {heatPumpError && (
            <p className="share-error" role="alert">
              {heatPumpError}
            </p>
          )}
          <div className="share-actions">
            <button type="button" className="button subtle" onClick={() => setStep('check')}>
              Back
            </button>
            <button type="button" className="button subtle" onClick={skipHeatPump}>
              Skip for now
            </button>
            <button type="submit" className="button">
              Continue
            </button>
          </div>
        </form>
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
            <button type="button" className="button subtle" onClick={() => setStep('heatPump')}>
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
