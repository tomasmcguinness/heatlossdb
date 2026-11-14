import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { isAuthConfigured } from '../../auth'
import { useFabric } from '../../fabric/store'
import { isComingSoon } from '../../features'
import { saveToAccount } from '../../share/homes'
import { useShare } from '../../share/share'
import { downloadHome } from '../files'
import { useAccount } from '../useAccount'
import { ChevronIcon, DownloadIcon, SaveIcon, SearchIcon, ShareIcon } from './icons'

interface Action {
  label: string
  text: string
  icon: ReactNode
  /** Missing while the action isn't available yet. */
  run?: () => void
}

type SaveStatus = { state: 'idle' | 'saving' | 'saved' } | { state: 'failed'; message: string }

/** How long "Saved" shows on the button (ms). */
const SAVED_FOR = 3000

/** The header's split button: Save to the user's account, with Search, Share and Download in its menu. */
export function ScanActions({ onShare, onSearch }: { onShare: () => void; onSearch: () => void }) {
  const shared = useShare()
  // Scans kept by this browser before Save existed can't be saved; opening the file again fixes it.
  const hasFile = useFabric((s) => s.scan?.raw !== undefined)
  const { isSignedIn, openSignIn } = useAccount()
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  // Save was asked for while signed out: it happens once they've signed in.
  const [saveAfterSignIn, setSaveAfterSignIn] = useState(false)

  const runSave = async () => {
    setStatus({ state: 'saving' })
    try {
      await saveToAccount()
      setStatus({ state: 'saved' })
    } catch (e) {
      setStatus({ state: 'failed', message: e instanceof Error ? e.message : 'Saving failed.' })
    }
  }

  useEffect(() => {
    if (!saveAfterSignIn || !isSignedIn) return
    setSaveAfterSignIn(false)
    void runSave()
    // runSave only reads the store, so it needn't be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAfterSignIn, isSignedIn])

  useEffect(() => {
    if (status.state !== 'saved') return
    const timer = setTimeout(() => setStatus({ state: 'idle' }), SAVED_FOR)
    return () => clearTimeout(timer)
  }, [status])

  const save: Action = {
    label: status.state === 'saving' ? 'Saving…' : status.state === 'saved' ? 'Saved' : 'Save',
    text: !isAuthConfigured
      ? "Sign-in isn't set up"
      : !hasFile
        ? 'Open your scan file again to save it'
        : isSignedIn
          ? 'Save to your account'
          : 'Sign in to save to your account',
    icon: <SaveIcon />,
    run:
      isAuthConfigured && hasFile && status.state !== 'saving'
        ? () => {
            if (isSignedIn) return void runSave()
            setSaveAfterSignIn(true)
            openSignIn()
          }
        : undefined,
  }
  const download: Action = {
    label: 'Download',
    text: hasFile ? 'Download your scan and edits as one file' : 'Open your scan file again to download it',
    icon: <DownloadIcon />,
    run: hasFile ? downloadHome : undefined,
  }
  const share: Action = {
    label: 'Share',
    text: isComingSoon('share')
      ? 'Add your home to the database · coming soon'
      : shared
        ? 'Your home is shared'
        : 'Add your home to the database',
    icon: <ShareIcon />,
    run: isComingSoon('share') ? undefined : onShare,
  }
  const search: Action = {
    label: 'Search',
    text: isComingSoon('search') ? 'Find similar homes · coming soon' : 'Find similar homes',
    icon: <SearchIcon />,
    run: isComingSoon('search') ? undefined : onSearch,
  }
  const actions = [search, share, download, save]
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
      {status.state === 'failed' && !open && (
        <p className="split-status error small" role="alert">
          {status.message}
        </p>
      )}
    </div>
  )
}
