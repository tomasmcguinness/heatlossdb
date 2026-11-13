import { ClerkProvider, useAuth } from '@clerk/react'
import { useEffect, useState, type ReactNode } from 'react'
import { setTokenGetter } from '../api'
import { clerkAppearance, clerkPublishableKey } from '../auth'

/** Clerk around the app when it's set up, its colours following the site's light or dark theme. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(clerkAppearance)

  useEffect(() => {
    const update = () => setAppearance(clerkAppearance())
    const dark = matchMedia('(prefers-color-scheme: dark)')
    dark.addEventListener('change', update)
    // The theme can also be forced with data-theme on <html>.
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      dark.removeEventListener('change', update)
      observer.disconnect()
    }
  }, [])

  if (!clerkPublishableKey) return children
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/" appearance={appearance}>
      <TokenBridge />
      {children}
    </ClerkProvider>
  )
}

/** Lets calls to the API outside React get the signed-in user's session token. */
function TokenBridge() {
  const { getToken } = useAuth()
  useEffect(() => setTokenGetter(() => getToken()), [getToken])
  return null
}
