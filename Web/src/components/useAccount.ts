import { useAuth, useClerk } from '@clerk/react'
import { isAuthConfigured } from '../auth'

export interface Account {
  /** Undefined until Clerk has loaded. */
  isSignedIn: boolean | undefined
  openSignIn: () => void
}

function useClerkAccount(): Account {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  return { isSignedIn, openSignIn: () => clerk.openSignIn() }
}

const signedOut: Account = { isSignedIn: false, openSignIn: () => {} }

/** The user's account, from Clerk. Clerk's hooks need its provider, which is only there when sign-in
 *  is set up, so without it this is always signed out. Which one is used never changes at runtime. */
export const useAccount: () => Account = isAuthConfigured ? useClerkAccount : () => signedOut

/** Where the logo takes you: your scans when signed in, otherwise the page to open a scan. */
export function homeHref(isSignedIn: boolean | undefined): string {
  return isSignedIn ? '/scans' : '/new'
}
