/** The options a build can hold back. */
export type Feature = 'search' | 'share' | 'explore'

const FEATURES: readonly Feature[] = ['search', 'share', 'explore']

const known = (names: string[]): ReadonlySet<Feature> => {
  const tidy = names.map((name) => name.trim().toLowerCase())
  return new Set(FEATURES.filter((feature) => tidy.includes(feature)))
}

/**
 * Options shown as "Coming soon" instead of usable: VITE_COMING_SOON, a comma-separated list such
 * as "search,explore". Deploys build with .env.production; development has everything on.
 */
export function parseComingSoon(value: string | undefined): ReadonlySet<Feature> {
  return known((value ?? '').split(','))
}

/**
 * The held-back options a user may use anyway, from their Clerk public metadata, which only the
 * Clerk dashboard (or its backend API) can set: { "features": ["search", "explore"] } for some, or
 * { "earlyAccess": true } for all of them.
 */
export function unlockedFeatures(metadata: unknown): ReadonlySet<Feature> {
  if (typeof metadata !== 'object' || metadata === null) return new Set()
  const { features, earlyAccess } = metadata as { features?: unknown; earlyAccess?: unknown }
  if (earlyAccess === true) return new Set(FEATURES)
  return Array.isArray(features) ? known(features.filter((f): f is string => typeof f === 'string')) : new Set()
}

const comingSoon = parseComingSoon(import.meta.env.VITE_COMING_SOON)

/** Held back by this build, for everyone. */
export const isComingSoon = (feature: Feature) => comingSoon.has(feature)
