import { useMemo } from 'react'
import { alignmentOf, editedRoom, effectiveRole, storeyName, useFabric, type EditedRoom } from '../../fabric/store'
import { floorPlans, type FloorPlan } from '../../scan/plan'
import type { ItemKind } from './kinds'

export interface EditorFloor {
  plan: FloorPlan
  name: string
  /** Every room on the floor as the user has corrected it. */
  rooms: EditedRoom[]
}

/** How the canvases and the side panel share hovering, selecting and renaming a room. */
export interface RoomActions {
  hoveredId: string | null
  selectedId: string | null
  hover: (id: string | null) => void
  /** Selects the room, or deselects it if it's already selected. */
  select: (id: string) => void
  /** Selects the room and starts changing its name. */
  rename: (id: string) => void
}

/** Every storey, lowest first, with its rooms as the user has corrected them. */
export function useEditorFloors(): EditorFloor[] {
  const scan = useFabric((s) => s.scan)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const alignment = useFabric((s) => s.alignment)
  const rooms = useFabric((s) => s.rooms)

  const plans = useMemo(() => {
    if (!scan) return []
    const roles = { elements, autoRoles, byId }
    return floorPlans(
      scan,
      (story) => alignmentOf({ alignment }, story),
      (id) => effectiveRole(roles, id) === 'external',
    )
  }, [scan, elements, autoRoles, byId, alignment])

  return useMemo(
    () =>
      plans.map((plan) => ({
        plan,
        name: scan ? storeyName(scan.stories, plan.story) : '',
        rooms: plan.rooms.map((room) => editedRoom(room, rooms[room.id])),
      })),
    [plans, rooms, scan],
  )
}

export const kindsOf = (room: EditedRoom): ItemKind[] => room.items.map((item) => item.kind)

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** "5 windows · 1 external door · 1 skylight" for a floor's rooms. */
export function totalsOf(rooms: EditedRoom[]): string {
  const count = (kind: ItemKind) => rooms.reduce((total, room) => total + room.items.filter((i) => i.kind === kind).length, 0)
  const parts = [plural(count('window'), 'window')]
  if (count('door')) parts.push(plural(count('door'), 'external door'))
  if (count('skylight')) parts.push(plural(count('skylight'), 'skylight'))
  return parts.join(' · ')
}

export const squareMetres = (area: number) => `${area < 10 ? area.toFixed(1) : Math.round(area)} m²`
