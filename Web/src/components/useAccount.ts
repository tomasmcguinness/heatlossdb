import { useMemo } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/react'
import { isAuthConfigured } from '../auth'
import { isComingSoon, unlockedFeatures, type Feature } from '../features'

export interface Account {
  /** Undefined until Clerk has loaded. */
  isSignedIn: boolean | undefined
  openSignIn: () => void
  /** Held-back features this account may use anyway (see unlockedFeatures). */
  features: ReadonlySet<Feature>
}

function useClerkAccount(): Account {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { user } = useUser()
  const metadata = user?.publicMetadata
  return { isSignedIn, openSignIn: () => clerk.openSignIn(), features: useMemo(() => unlockedFeatures(metadata), [metadata]) }
}

const signedOut: Account = { isSignedIn: false, openSignIn: () => {}, features: new Set() }

/** The user's account, from Clerk. Clerk's hooks need its provider, which is only there when sign-in
 *  is set up, so without it this is always signed out. Which one is used never changes at runtime. */
export const useAccount: () => Account = isAuthConfigured ? useClerkAccount : () => signedOut

/** Where the logo takes you: your scans when signed in, otherwise the page to open a scan. */
export function homeHref(isSignedIn: boolean | undefined): string {
  return isSignedIn ? '/scans' : '/new'
}

/** Whether an option is held back for whoever is signed in: held back by the build, and not
 *  unlocked on their account. Only hides it in the app; the API doesn't check. */
export function useComingSoon(): (feature: Feature) => boolean {
  const { features } = useAccount()
  return (feature) => isComingSoon(feature) && !features.has(feature)
}
