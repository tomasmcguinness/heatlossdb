import { useRef, useState } from 'react'
import { errorMessage, openFile } from './files'

export function DropZone({ error, onError }: { error: string | null; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const open = async (file: File | undefined) => {
    if (!file) return
    try {
      onError(null)
      await openFile(file)
    } catch (e) {
      onError(errorMessage(e))
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
        <p className="muted">
          Drop the <code>merged.json</code> shared from the HeatLossDB app after completing a survey.
        </p>
        <button className="button" onClick={() => input.current?.click()}>
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
