import { Show, SignInButton, UserButton } from '@clerk/react'
import { isAuthConfigured } from '../auth'
import { HomeIcon, ShieldIcon } from './editor/icons'
import { useAccount } from './useAccount'

/**
 * Top right of every page: "Sign in" when signed out, which opens Clerk's sign-in-or-up modal
 * (an emailed magic link, so new addresses sign up in the same flow), and the account menu
 * when signed in. Nothing until Clerk has loaded, and nothing at all if it isn't set up.
 */
export function AccountButton() {
  if (!isAuthConfigured) return null
  return <ClerkAccountButton />
}

/** Split out so useAccount (Clerk's hooks) only runs when Clerk is set up. */
function ClerkAccountButton() {
  const { isAdmin } = useAccount()
  return (
    <div className="account">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="button subtle account-sign-in">Sign in</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        {/* Clerk checks the menu's children, so the admin's menu is a whole one of its own rather
            than a conditional item. */}
        {isAdmin ? (
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link label="My scans" href="/scans" labelIcon={<HomeIcon />} />
              <UserButton.Link label="Admin portal" href="/admin" labelIcon={<ShieldIcon />} />
            </UserButton.MenuItems>
          </UserButton>
        ) : (
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link label="My scans" href="/scans" labelIcon={<HomeIcon />} />
            </UserButton.MenuItems>
          </UserButton>
        )}
      </Show>
    </div>
  )
}
