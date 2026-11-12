/**
 * Accounts are Clerk's (https://clerk.com), signing in with an emailed magic link. Without a
 * publishable key (e.g. in tests, or a local build that hasn't set one up) the site works as
 * before, without sign in.
 */
export const clerkPublishableKey: string | undefined = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || undefined

export const isAuthConfigured = clerkPublishableKey !== undefined

/** Clerk's colour variables, taken from ours. */
const TOKENS = {
  colorPrimary: '--accent',
  colorPrimaryForeground: '--accent-text',
  colorBackground: '--surface',
  colorForeground: '--text',
  colorMutedForeground: '--muted',
  colorBorder: '--border',
  colorInput: '--surface',
  colorInputForeground: '--text',
  colorNeutral: '--text',
} as const

/**
 * Clerk's modal and account menu in the site's colours, as they are now (light or dark). Clerk
 * works out hover shades and contrast from these, so they must be actual colours: a var(--…)
 * string comes out grey.
 */
export function clerkAppearance() {
  const style = getComputedStyle(document.documentElement)
  const variables: Record<string, string> = { fontFamily: 'inherit', borderRadius: '8px' }
  for (const [name, token] of Object.entries(TOKENS)) {
    const value = style.getPropertyValue(token).trim()
    if (value) variables[name] = value
  }
  return { variables }
}
