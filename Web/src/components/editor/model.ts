import { useMemo } from 'react'
import {
  alignmentOf,
  editedRoom,
  effectiveRole,
  storeyName,
  useFabric,
  type EditedRoom,
  type ElementSettings,
  type RoomSettings,
} from '../../fabric/store'
import type { StoreyAlignment } from '../../scan/align'
import type { Role } from '../../scan/classify'
import { floorPlans, type FloorPlan } from '../../scan/plan'
import type { Scan, ScanElement } from '../../scan/types'
import type { Bounds } from './FloorCanvas'
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

/** What the floors are drawn from, besides the scan: the store's settings, or a preview's. */
export interface FloorSettings {
  elements: Record<string, ElementSettings>
  autoRoles: Record<string, Role>
  byId: Map<string, ScanElement>
  alignment: Record<number, StoreyAlignment>
  rooms: Record<string, RoomSettings>
}

function plansOf(scan: Scan, { elements, autoRoles, byId, alignment }: Omit<FloorSettings, 'rooms'>): FloorPlan[] {
  const roles = { elements, autoRoles, byId }
  return floorPlans(
    scan,
    (story) => alignmentOf({ alignment }, story),
    (id) => effectiveRole(roles, id) === 'external',
  )
}

function floorsOf(scan: Scan, plans: FloorPlan[], rooms: Record<string, RoomSettings>): EditorFloor[] {
  return plans.map((plan) => ({
    plan,
    name: storeyName(scan.stories, plan.story),
    rooms: plan.rooms.map((room) => editedRoom(room, rooms[room.id])),
  }))
}

/** Every storey of a scan, lowest first, with its rooms as the user has corrected them. Also
 *  draws a scan that isn't open, such as a tidied preview. */
export const editorFloors = (scan: Scan, settings: FloorSettings): EditorFloor[] => floorsOf(scan, plansOf(scan, settings), settings.rooms)

/** Every storey of the open scan, lowest first, with its rooms as the user has corrected them. */
export function useEditorFloors(): EditorFloor[] {
  const scan = useFabric((s) => s.scan)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const alignment = useFabric((s) => s.alignment)
  const rooms = useFabric((s) => s.rooms)

  // Rooms change far more often than what the plans are drawn from, so they're kept apart.
  const plans = useMemo(() => (scan ? plansOf(scan, { elements, autoRoles, byId, alignment }) : []), [scan, elements, autoRoles, byId, alignment])
  return useMemo(() => (scan ? floorsOf(scan, plans, rooms) : []), [plans, rooms, scan])
}

/** The bounds of every floor together, so they're drawn to one scale. Not finite with no outlines. */
export function boundsOf(floors: EditorFloor[]): Bounds {
  const points = floors.flatMap((f) => f.plan.outlines.flat())
  const minX = Math.min(...points.map((p) => p[0]))
  const minZ = Math.min(...points.map((p) => p[1]))
  return {
    minX,
    minZ,
    width: Math.max(...points.map((p) => p[0])) - minX,
    depth: Math.max(...points.map((p) => p[1])) - minZ,
  }
}

export const kindsOf =(room: EditedRoom): ItemKind[] => room.items.map((item) => item.kind)

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
