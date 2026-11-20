import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useFabric, type EditedRoom } from '../../fabric/store'
import { answeredCount, isHomeFabricSet, QUESTION_COUNT } from '../../fabric/home'
import { listingName } from '../../share/listing'
import { outwardCode } from '../../share/postcode'
import { saveShare, submitShare, updateShareLink, useShare, type SharedHome } from '../../share/share'
import { EMPTY_HEAT_PUMP_FORM, heatPumpRecord, isHeatPumpFormEmpty, type HeatPumpForm } from '../../share/heatPumpForm'
import type { HeatPumpData } from '../../match/heatPump'
import { CheckIcon } from '../editor/icons'

type Step = 'check' | 'heatPump' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'check', label: 'Check' },
  { id: 'heatPump', label: 'Heat pump' },
  { id: 'done', label: 'Done' },
]

// Room names can say who lives there ("Sophie’s room"), so shared homes show Room 1, Room 2…
// The option to show them is hidden for now.
const SHARE_ROOM_NAMES = false

interface ShareDialogProps {
  /** Every room in the home. */
  rooms: EditedRoom[]
  onClose: () => void
  /** Closes the dialog and opens Home fabric. */
  onFabric: () => void
  /** Closes the dialog and takes the user to the first room still to check. */
  onCheckRooms: () => void
}

/** Share your home: checks the scan is ready, then takes any heat pump figures and shares it.
 *  Only signed-in users can open it, so there's no account to create. */
export function ShareDialog({ rooms, onClose, onFabric, onCheckRooms }: ShareDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const homeKey = useFabric((s) => s.homeKey)
  const home = useFabric((s) => s.home)
  const shared = useShare()
  const [step, setStep] = useState<Step>(shared ? 'done' : 'check')
  const [agreed, setAgreed] = useState(false)
  // Prefilled from Home fabric, where finding similar homes asks for it too.
  const [postcode, setPostcode] = useState(home.postcodeDistrict ?? '')
  const [postcodeTouched, setPostcodeTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [heatPumpForm, setHeatPumpForm] = useState<HeatPumpForm>(EMPTY_HEAT_PUMP_FORM)
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

  const share = async (heatPump: HeatPumpData | null) => {
    setError(null)
    setBusy(true)
    try {
      const link = await submitShare(name, { postcodeDistrict: postcodeDistrict!, shareRoomNames: SHARE_ROOM_NAMES, home }, heatPump)
      if (homeKey) saveShare(homeKey, { name, sharedAt: new Date().toISOString(), url: link.url })
      setStep('done')
    } catch {
      setError('Couldn’t share your home. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const skipHeatPump = () => {
    setHeatPumpError(null)
    void share(null)
  }

  const shareWithHeatPump = (e: FormEvent) => {
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
    void share(result.record)
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
            </>
          )}

          <div className="share-actions">
            <button className="button subtle" onClick={close}>
              Cancel
            </button>
            <button className="button" disabled={!ready || !postcodeDistrict} onClick={() => setStep('heatPump')}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'heatPump' && (
        <form className="share-body" onSubmit={shareWithHeatPump} noValidate>
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
          <label className="share-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I’m happy with my scan and agree to share it and my home’s details anonymously.</span>
          </label>
          {(heatPumpError ?? error) && (
            <p className="share-error" role="alert">
              {heatPumpError ?? error}
            </p>
          )}
          <div className="share-actions">
            <button type="button" className="button subtle" onClick={() => setStep('check')}>
              Back
            </button>
            <button type="submit" className="button" disabled={busy || !agreed}>
              {busy ? 'Sharing…' : 'Share home'}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && shared && (
        <div className="share-body">
          <h3>Your home is shared</h3>
          <p>
            It appears in search as <strong>{shared.name}</strong>, so others with similar homes can learn from it.
          </p>
          <ShareLinkField share={shared} />
          <div className="share-actions">
            <button className="button" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}

/**
 * The home's own link, to send to anyone: it opens the home to look at, with room names hidden, as
 * it was when shared. Update link shares the home as it is now under the same link. A home shared
 * before links existed gets one here.
 */
function ShareLinkField({ share }: { share: SharedHome }) {
  const homeKey = useFabric((s) => s.homeKey)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = async () => {
    setError(null)
    setBusy(true)
    try {
      const link = await updateShareLink()
      if (homeKey) saveShare(homeKey, { ...share, sharedAt: new Date().toISOString(), url: link.url })
    } catch {
      setError('Couldn’t update the link. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!share.url) return
    try {
      await navigator.clipboard.writeText(share.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Couldn’t copy the link. Select it and copy it instead.')
    }
  }

  return (
    <div className="share-link">
      {share.url ? (
        <>
          <label className="field">
            <span className="field-label">Link to your home</span>
            <span className="share-link-row">
              <input readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="button" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </span>
          </label>
          <p className="small muted">
            Anyone with the link can see your floor plan and each room’s details, but not your room names, postcode or email. It
            shows your home as it was when you shared it.
          </p>
          <button type="button" className="button subtle" disabled={busy} onClick={() => void update()}>
            {busy ? 'Updating…' : 'Update link with my latest changes'}
          </button>
        </>
      ) : (
        <button type="button" className="button" disabled={busy} onClick={() => void update()}>
          {busy ? 'Making link…' : 'Get a link to your home'}
        </button>
      )}
      {error && (
        <p className="share-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
