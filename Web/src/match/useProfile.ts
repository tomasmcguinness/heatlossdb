import { useEffect, useMemo } from 'react'
import { effectiveRole, useFabric } from '../fabric/store'
import { computeProfile, type ShapeProfile } from './profile'

/** Wait this long after the last change (e.g. marking walls) before saving the profile. */
const SAVE_DELAY_MS = 800

/**
 * The open scan's shape profile, kept up to date as the user corrects wall roles or storey
 * alignment, and saved to the API for an uploaded survey so other homes can match against it.
 */
export function useProfile(surveyId: string | null): ShapeProfile | null {
  const scan = useFabric((s) => s.scan)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const alignment = useFabric((s) => s.alignment)

  const profile = useMemo(() => {
    if (!scan) return null
    const state = { elements, autoRoles, byId }
    return computeProfile(scan, (id) => effectiveRole(state, id), alignment)
  }, [scan, elements, autoRoles, byId, alignment])

  useEffect(() => {
    if (!surveyId || !profile) return
    const timer = setTimeout(() => {
      fetch(`/api/surveys/${surveyId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      }).catch(() => {
        // Matching still works for this viewer; the profile is saved again on the next change.
      })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [surveyId, profile])

  return profile
}
