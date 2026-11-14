import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  AGE_BANDS,
  answeredCount,
  customFabricCount,
  DOORS,
  FLOOR_INSULATION,
  FLOOR_TYPES,
  LOFT_DEPTHS,
  LOFTS,
  PROPERTY_TYPES,
  QUESTION_COUNT,
  WALLS,
  WINDOWS,
  type Choice,
} from '../../fabric/home'
import { useFabric, type HomeFabric } from '../../fabric/store'
import { outwardCode } from '../../share/postcode'
import { DoorIcon, HomeIcon, InfoIcon, WindowIcon } from '../editor/icons'

/** One question, answered by tapping one of its choices. */
function Question({ label, choices, value, onChange }: { label: string; choices: Choice[]; value: string | undefined; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="fabric-question">
      <span id={id}>{label}</span>
      <div className="choices" role="radiogroup" aria-labelledby={id}>
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={value === c.value ? 'choice on' : 'choice'}
            onClick={() => onChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Card({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="fabric-card" aria-labelledby={id}>
      <div className="fabric-card-head">
        <span className="fabric-card-icon">{icon}</span>
        <h2 id={id}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

const Tip = ({ children }: { children: ReactNode }) => (
  <p className="fabric-tip">
    <b>How to tell:</b> {children}
  </p>
)

const icon = (paths: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
)

const WallIcon = () =>
  icon(
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 9.7 H21 M3 14.3 H21 M9 5 V9.7 M15 5 V9.7 M6 9.7 V14.3 M12 9.7 V14.3 M18 9.7 V14.3 M9 14.3 V19 M15 14.3 V19" />
    </>,
  )

const LoftIcon = () =>
  icon(
    <>
      <path d="M2 14 L12 4 L22 14" />
      <path d="M5 14 H19" />
      <path d="M6 17 H18" strokeDasharray="2 2" />
    </>,
  )

const FloorIcon = () =>
  icon(
    <>
      <path d="M3 10 H21" />
      <path d="M3 14 H21" />
      <path d="M5 18 L7 16 M9 18 L11 16 M13 18 L15 16 M17 18 L19 16" />
    </>,
  )

const WarningIcon = () =>
  icon(
    <>
      <path d="M12 3 L22 20 H2 Z" />
      <path d="M12 10 V14" />
      <path d="M12 17 V17.01" />
    </>,
  )

/**
 * Home fabric: a few plain-language questions about how the whole home is built, for people
 * who don't know much about it. Anything left unanswered uses typical values for the home's
 * age. Applying replaces any room's, door's, window's or element's own fabric, so it asks first
 * if there are any.
 */
export function HomeFabricDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const saved = useFabric((s) => s.home)
  const elements = useFabric((s) => s.elements)
  const rooms = useFabric((s) => s.rooms)
  const applyHome = useFabric((s) => s.applyHome)
  const [home, setDraft] = useState<HomeFabric>(saved)
  const [confirming, setConfirming] = useState(false)
  const [postcode, setPostcode] = useState(saved.postcodeDistrict ?? '')
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  const custom = customFabricCount(elements, rooms)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    if (confirming) keepButton.current?.focus()
  }, [confirming])

  const set = (patch: Partial<HomeFabric>) => setDraft((h) => ({ ...h, ...patch }))
  const close = () => dialog.current?.close()
  const apply = () => {
    applyHome(home)
    close()
  }
  // The postcode is optional, but one that's typed must be a postcode. Only its first part is kept.
  const checkPostcode = () => {
    const district = outwardCode(postcode)
    if (postcode.trim() && !district) {
      setPostcodeError('Enter the first part of your postcode, like SW1A or M1, or leave it blank.')
      return false
    }
    setPostcodeError(null)
    setPostcode(district ?? '')
    set({ postcodeDistrict: district ?? undefined })
    return true
  }
  const applyClicked = () => {
    if (!checkPostcode()) return
    if (custom) setConfirming(true)
    else {
      // The draft's postcode is set in the same click, so apply what checkPostcode just stored.
      applyHome({ ...home, postcodeDistrict: outwardCode(postcode) ?? undefined })
      close()
    }
  }

  return (
    <dialog
      ref={dialog}
      className="fabric-dialog"
      aria-labelledby="fabric-dialog-title"
      onClose={onClose}
      // Escape closes the warning first, then the dialog.
      onCancel={(e) => {
        if (!confirming) return
        e.preventDefault()
        setConfirming(false)
      }}
    >
      <header className="fabric-head">
        <div>
          <h1 id="fabric-dialog-title">Home fabric</h1>
          <p className="muted small">A few quick questions about how your home is built, which will help find a better match</p>
        </div>
        <button className="icon-only fabric-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>

      <main className="fabric-main">
        <p className="fabric-note">
          <InfoIcon />
          <span>
            Don’t worry if you’re not sure. Pick the closest answer or “Not sure” and we’ll use typical values for a home of its
            age. You can fine-tune individual walls, windows and doors later.
          </span>
        </p>

        <Card id="fabric-home" title="Your home" icon={<HomeIcon size={22} />}>
          <label className="field fabric-postcode">
            <span className="field-label">First part of your postcode</span>
            <input
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="SW1A"
              value={postcode}
              aria-invalid={postcodeError ? true : undefined}
              aria-describedby="fabric-postcode-note"
              onChange={(e) => setPostcode(e.target.value)}
              onBlur={checkPostcode}
            />
            <span id="fabric-postcode-note" className={postcodeError ? 'share-error' : 'small muted'} role={postcodeError ? 'alert' : undefined}>
              {postcodeError ?? 'For your area’s winter temperatures. Just the first part, never your full postcode.'}
            </span>
          </label>
          <Question label="What type of property is it?" choices={PROPERTY_TYPES} value={home.propertyType} onChange={(v) => set({ propertyType: v })} />
          <Question label="Roughly when was it built?" choices={AGE_BANDS} value={home.ageBand} onChange={(v) => set({ ageBand: v })} />
        </Card>

        <Card id="fabric-walls" title="Outside walls" icon={<WallIcon />}>
          <Question label="What are the outside walls like?" choices={WALLS} value={home.walls} onChange={(v) => set({ walls: v })} />
          <Tip>
            homes built before about 1930 usually have solid walls, with some bricks laid end-on. A neat pattern of filled drill
            holes in the mortar means the cavity has been insulated.
          </Tip>
        </Card>

        <Card id="fabric-loft" title="Loft" icon={<LoftIcon />}>
          <Question
            label="Is the loft insulated?"
            choices={LOFTS}
            value={home.loft}
            // The follow-up only applies to an insulated loft.
            onChange={(v) => set({ loft: v, loftDepth: v === 'yes' ? home.loftDepth : undefined })}
          />
          {home.loft === 'yes' && (
            <div className="fabric-follow-up">
              <Question
                label="Does the insulation come up above the top of the wooden joists?"
                choices={LOFT_DEPTHS}
                value={home.loftDepth}
                onChange={(v) => set({ loftDepth: v })}
              />
              <p className="fabric-tip">Joists are usually about 100 mm deep. Insulation well above them is probably a modern top-up of 200 mm or more.</p>
            </div>
          )}
        </Card>

        <Card id="fabric-windows" title="Windows" icon={<WindowIcon size={22} />}>
          <Question label="What are most of the windows?" choices={WINDOWS} value={home.windows} onChange={(v) => set({ windows: v })} />
          <Tip>look for a date printed on the metal strip between the panes. Skylights are assumed to match.</Tip>
        </Card>

        <Card id="fabric-doors" title="Outside doors" icon={<DoorIcon size={22} />}>
          <Question label="What are your front and back doors mostly like?" choices={DOORS} value={home.doors} onChange={(v) => set({ doors: v })} />
        </Card>

        <Card id="fabric-floor" title="Ground floor" icon={<FloorIcon />}>
          <Question label="What is the ground floor made of?" choices={FLOOR_TYPES} value={home.floorType} onChange={(v) => set({ floorType: v })} />
          <Question label="Has it been insulated?" choices={FLOOR_INSULATION} value={home.floorInsulation} onChange={(v) => set({ floorInsulation: v })} />
          <Tip>a floor that sounds hollow, with air bricks low on the outside walls, is usually suspended timber.</Tip>
        </Card>
      </main>

      <footer className="fabric-foot">
        <span className="muted">
          {answeredCount(home)} of {QUESTION_COUNT} answered · anything left blank uses typical values
        </span>
        <div className="fabric-foot-actions">
          <button className="button subtle" onClick={close}>
            Cancel
          </button>
          <button className="button" onClick={applyClicked}>
            Apply to whole home
          </button>
        </div>
      </footer>

      {confirming && (
        <div className="fabric-confirm-backdrop">
          <div className="fabric-confirm" role="alertdialog" aria-modal="true" aria-labelledby="fabric-confirm-title" aria-describedby="fabric-confirm-body">
            <div className="fabric-card-head">
              <span className="fabric-card-icon warning">
                <WarningIcon />
              </span>
              <h2 id="fabric-confirm-title">Replace custom settings?</h2>
            </div>
            <p id="fabric-confirm-body">
              This applies your answers to every wall, window, door and floor in the home. The {custom}{' '}
              {custom === 1 ? 'change' : 'changes'} you’ve made to individual rooms, doors and windows will be lost.
            </p>
            <div className="fabric-foot-actions">
              <button ref={keepButton} className="button subtle" onClick={() => setConfirming(false)}>
                Keep my changes
              </button>
              <button className="button" onClick={apply}>
                Replace and apply
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
