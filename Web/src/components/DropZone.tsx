import { useRef, useState } from 'react'
import { errorMessage, isValidCode, normaliseCode, openFile, surveyIdForCode } from './files'

export function DropZone({ error, onError }: { error: string | null; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [code, setCode] = useState('')
  const [checkingCode, setCheckingCode] = useState(false)

  const open = async (file: File | undefined) => {
    if (!file) return
    try {
      onError(null)
      await openFile(file)
    } catch (e) {
      onError(errorMessage(e))
    }
  }

  const openCode = async (value = code) => {
    const typed = normaliseCode(value)
    if (!isValidCode(typed)) {
      onError('Codes are 5 letters and numbers, as shown in the app after uploading.')
      return
    }
    setCheckingCode(true)
    try {
      onError(null)
      // The survey's own link, so it can be bookmarked and reloaded once the code has expired.
      location.assign(`/s/${await surveyIdForCode(typed)}`)
    } catch (e) {
      onError(errorMessage(e))
      setCheckingCode(false)
    }
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void open(e.dataTransfer.files[0])
      }}
    >
      <div className="dropzone-card">
        <h2>Open a scan</h2>
        <p className="muted">Upload your survey from the HeatLossDB app, then enter the code it shows.</p>
        <form
          className="code-form"
          onSubmit={(e) => {
            e.preventDefault()
            void openCode()
          }}
        >
          <input
            className="code-input"
            aria-label="Upload code"
            placeholder="A7K3P"
            value={code}
            maxLength={7}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              const value = e.target.value.toUpperCase()
              setCode(value)
              // A whole code opens straight away; Open is still there to try again.
              if (!checkingCode && isValidCode(normaliseCode(value))) void openCode(value)
            }}
          />
          <button className="button" type="submit" disabled={checkingCode || code.trim() === ''}>
            {checkingCode ? 'Opening…' : 'Open'}
          </button>
        </form>
        <p className="dropzone-or muted small">or</p>
        <p className="muted">
          Drop the <code>merged.json</code> shared from the app.
        </p>
        <button className="button subtle" onClick={() => input.current?.click()}>
          Choose file
        </button>
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
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
