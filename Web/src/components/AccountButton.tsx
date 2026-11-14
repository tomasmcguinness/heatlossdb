import { Show, SignInButton, UserButton } from '@clerk/react'
import { isAuthConfigured } from '../auth'
import { HomeIcon } from './editor/icons'

/**
 * Top right of every page: "Sign in" when signed out, which opens Clerk's sign-in-or-up modal
 * (an emailed magic link, so new addresses sign up in the same flow), and the account menu
 * when signed in. Nothing until Clerk has loaded, and nothing at all if it isn't set up.
 */
export function AccountButton() {
  if (!isAuthConfigured) return null
  return (
    <div className="account">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="button subtle account-sign-in">Sign in</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton>
          <UserButton.MenuItems>
            <UserButton.Link label="My scans" href="/scans" labelIcon={<HomeIcon />} />
          </UserButton.MenuItems>
        </UserButton>
      </Show>
    </div>
  )
}
