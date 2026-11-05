import { FIELDS, KIND_LABELS } from '../fabric/options'
import { useFabric } from '../fabric/store'
import { ELEMENT_KINDS } from '../scan/types'

export function DefaultsPanel() {
  const defaults = useFabric((s) => s.defaults)
  const setDefaultField = useFabric((s) => s.setDefaultField)
  const setDefaultUValue = useFabric((s) => s.setDefaultUValue)

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Defaults</h2>
        <p className="muted">
          Applied to every external and party element of each type. Anything you set on an individual element overrides
          these.
        </p>
      </header>

      {ELEMENT_KINDS.filter((kind) => FIELDS[kind].length > 0).map((kind) => (
        <section key={kind}>
          <h3>{KIND_LABELS[kind].many}</h3>
          {FIELDS[kind].map((field) => (
            <label key={field.key} className="field">
              <span className="field-label">{field.label}</span>
              <select
                value={defaults[kind].fields[field.key] ?? ''}
                onChange={(e) => setDefaultField(kind, field.key, e.target.value || undefined)}
              >
                <option value="">Not set</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="field">
            <span className="field-label">U-value (W/m²K, optional)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              placeholder="If known"
              value={defaults[kind].uValue ?? ''}
              onChange={(e) => setDefaultUValue(kind, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </label>
        </section>
      ))}
    </div>
  )
}
