/** The options a build can hold back. */
export type Feature = 'search' | 'share' | 'explore'

const FEATURES: readonly Feature[] = ['search', 'share', 'explore']

/**
 * Options shown as "Coming soon" instead of usable: VITE_COMING_SOON, a comma-separated list such
 * as "search,explore". Deploys build with .env.production; development has everything on.
 */
export function parseComingSoon(value: string | undefined): ReadonlySet<Feature> {
  const names = (value ?? '').split(',').map((name) => name.trim().toLowerCase())
  return new Set(FEATURES.filter((feature) => names.includes(feature)))
}

const comingSoon = parseComingSoon(import.meta.env.VITE_COMING_SOON)

export const isComingSoon = (feature: Feature) => comingSoon.has(feature)
