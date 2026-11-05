import { FIELDS, KIND_LABELS, ROLE_LABELS } from '../fabric/options'
import { effectiveField, effectiveRole, effectiveUValue, storeyName, useFabric } from '../fabric/store'
import type { Role } from '../scan/classify'
import { areaOf } from '../scan/geometry'
import type { ScanElement } from '../scan/types'

const ROLES: Role[] = ['external', 'party', 'internal']

/** Roles make sense for walls and the floors/ceilings that bound the heated space. */
const HAS_ROLE = new Set(['wall', 'floor', 'ceiling'])

function SourceTag({ source }: { source: 'element' | 'default' | 'unset' }) {
  if (source === 'element') return <span className="tag tag-set">Set here</span>
  if (source === 'default') return <span className="tag">Default</span>
  return <span className="tag tag-missing">Not set</span>
}

function ElementLink({ element }: { element: ScanElement }) {
  const select = useFabric((s) => s.select)
  const hover = useFabric((s) => s.hover)
  return (
    <button
      className="link"
      onClick={() => select(element.id)}
      onMouseEnter={() => hover(element.id)}
      onMouseLeave={() => hover(null)}
    >
      {KIND_LABELS[element.kind].one} · {element.width.toFixed(2)} × {element.height.toFixed(2)} m
    </button>
  )
}

export function ElementPanel() {
  const state = useFabric()
  const element = state.selectedId ? state.byId.get(state.selectedId) : undefined

  if (!element || !state.scan) {
    return (
      <div className="panel-empty">
        <p>Click a wall, window, door or floor to describe it.</p>
        <p className="muted">Drag to rotate, scroll or pinch to zoom, right-drag to pan.</p>
      </div>
    )
  }

  const role = effectiveRole(state, element.id)
  const ownRole = state.elements[element.id]?.role
  const parent = element.parentId ? state.byId.get(element.parentId) : undefined
  // Openings aren't drawn, so don't link to them.
  const children = (state.childrenOf.get(element.id) ?? []).filter((c) => c.kind !== 'opening')
  const fields = FIELDS[element.kind]
  const uValue = effectiveUValue(state, element)
  const hasSettings = Boolean(state.elements[element.id])
  const autoRole = parent ? effectiveRole(state, parent.id) : (state.autoRoles[element.id] ?? 'internal')

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>{KIND_LABELS[element.kind].one}</h2>
        <p className="muted">
          {storeyName(state.scan.stories, element.story)} · {element.width.toFixed(2)} ×{' '}
          {element.height.toFixed(2)} m · {areaOf(element).toFixed(1)} m²
          {element.kind === 'door' && (element.isOpen ? ' · open when scanned' : '')}
        </p>
      </header>

      {element.synthetic && (
        <p className="note">
          Added by HeatLossDB. The scan has no wall here, usually because it's the end of a built-in wardrobe the scanner
          couldn't see past. Its size comes from the gap in the room outline.
        </p>
      )}

      {parent && (
        <section>
          <h3>In</h3>
          <ElementLink element={parent} />
        </section>
      )}

      {(HAS_ROLE.has(element.kind) || ownRole) && (
        <section>
          <h3>
            Role{' '}
            {ownRole ? (
              <button className="link small" onClick={() => state.setRole(element.id, undefined)}>
                Use guess ({ROLE_LABELS[autoRole].toLowerCase()})
              </button>
            ) : (
              <span className="tag">Guessed</span>
            )}
          </h3>
          <div className="segmented" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={role === r}
                className={role === r ? `on role-${r}` : ''}
                onClick={() => state.setRole(element.id, r)}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          {element.kind === 'ceiling' && (
            <p className="muted small">
              Mark a ceiling External where there's a roof or cold loft above it, including over single-storey parts of
              the house.
            </p>
          )}
        </section>
      )}

      {!HAS_ROLE.has(element.kind) && !ownRole && (
        <p className="muted small">
          {ROLE_LABELS[role]}, because it's in an {ROLE_LABELS[role].toLowerCase()} wall.
        </p>
      )}

      {element.kind === 'storage' ? (
        <p className="muted small">
          {element.detail ? `RoomPlan saw this as a ${element.detail}. ` : ''}Built-in storage is shown so you can see
          where the scan couldn't reach. Where it hides an outside wall, HeatLossDB adds the missing wall itself.
        </p>
      ) : role === 'internal' ? (
        <p className="muted small">Internal elements don't need describing. Mark it External or Party to add details.</p>
      ) : fields.length === 0 ? (
        <p className="muted small">Openings are gaps between spaces, so there's nothing to describe.</p>
      ) : (
        <section>
          <h3>Construction</h3>
          {fields.map((field) => {
            const current = effectiveField(state, element, field.key)
            const own = state.elements[element.id]?.fields?.[field.key] ?? ''
            const fallback = state.defaults[element.kind].fields[field.key]
            return (
              <label key={field.key} className="field">
                <span className="field-label">
                  {field.label} <SourceTag source={current.source} />
                </span>
                <select value={own} onChange={(e) => state.setField(element.id, field.key, e.target.value || undefined)}>
                  <option value="">{fallback ? `Default: ${fallback}` : 'Use default (not set)'}</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
          <label className="field">
            <span className="field-label">
              U-value (W/m²K, optional) <SourceTag source={uValue.source} />
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              placeholder={uValue.source === 'default' ? `Default: ${uValue.value}` : 'If known'}
              value={state.elements[element.id]?.uValue ?? ''}
              onChange={(e) => state.setUValue(element.id, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </label>
        </section>
      )}

      {children.length > 0 && (
        <section>
          <h3>In this wall</h3>
          <ul className="plain">
            {children.map((child) => (
              <li key={child.id}>
                <ElementLink element={child} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasSettings && (
        <button className="button subtle" onClick={() => state.resetElement(element.id)}>
          Reset to defaults
        </button>
      )}
    </div>
  )
}
