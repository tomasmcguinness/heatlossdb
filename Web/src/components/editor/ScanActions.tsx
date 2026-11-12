import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useFabric } from '../../fabric/store'
import { useShare } from '../../share/share'
import { saveHome } from '../files'
import { ChevronIcon, SaveIcon, SearchIcon, ShareIcon } from './icons'

interface Action {
  label: string
  text: string
  icon: ReactNode
  /** Missing while the action isn't available yet. */
  run?: () => void
}

const SEARCH: Action = { label: 'Search', text: 'Find similar homes · coming soon', icon: <SearchIcon /> }

/** The header's split button: Save, with Search and Share in its menu. */
export function ScanActions({ onShare }: { onShare: () => void }) {
  const shared = useShare()
  // Scans kept by this browser before Save existed can't be saved; opening the file again fixes it.
  const canSave = useFabric((s) => s.scan?.raw !== undefined)
  const save: Action = {
    label: 'Save',
    text: canSave ? 'Download your scan and edits as one file' : 'Open your scan file again to save it',
    icon: <SaveIcon />,
    run: canSave ? saveHome : undefined,
  }
  const share: Action = {
    label: 'Share',
    text: shared ? 'Waiting for you to confirm your email' : 'Add your home to the database',
    icon: <ShareIcon />,
    run: onShare,
  }
  const actions = [SEARCH, share, save]
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const shut = () => {
    setOpen(false)
    toggle.current?.focus()
  }

  // Up and down move between the menu's items; Escape and Tab close it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') shut()
    if (e.key === 'Tab') setOpen(false)
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div className="split-button" ref={root} onKeyDown={onKeyDown}>
      <button className="button split-main" disabled={!save.run} title={save.text} onClick={save.run}>
        {save.icon}
        {save.label}
      </button>
      <button
        ref={toggle}
        className="button split-toggle"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronIcon />
      </button>
      {open && (
        <div className="split-menu" role="menu" ref={menu} aria-label="Actions">
          {actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              disabled={!action.run}
              onClick={() => {
                // Close first, so an action that opens a dialog can take the focus.
                shut()
                action.run?.()
              }}
            >
              {action.icon}
              <span>
                <span className="split-label">{action.label}</span>
                <span className="small muted">{action.text}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
