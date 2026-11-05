import type { ElementKind } from '../scan/types'
import type { Role } from '../scan/classify'

export interface FieldDefinition {
  key: string
  label: string
  options: string[]
}

export const KIND_LABELS: Record<ElementKind, { one: string; many: string }> = {
  wall: { one: 'Wall', many: 'Walls' },
  window: { one: 'Window', many: 'Windows' },
  door: { one: 'Door', many: 'Doors' },
  opening: { one: 'Opening', many: 'Openings' },
  floor: { one: 'Floor', many: 'Floors' },
  ceiling: { one: 'Ceiling / roof', many: 'Ceilings / roofs' },
  storage: { one: 'Storage', many: 'Storage' },
}

export const ROLE_LABELS: Record<Role, string> = {
  external: 'External',
  party: 'Party',
  internal: 'Internal',
}

/** Descriptive construction fields per element type. These describe the fabric so similar
 *  houses can be found; heatlossdb doesn't calculate heat loss from them. */
export const FIELDS: Record<ElementKind, FieldDefinition[]> = {
  wall: [
    {
      key: 'construction',
      label: 'Construction',
      options: ['Solid brick', 'Cavity', 'Stone', 'Timber frame', 'System built', 'Other'],
    },
    {
      key: 'insulation',
      label: 'Insulation',
      options: ['None', 'Cavity fill', 'Internal (IWI)', 'External (EWI)', 'Unknown'],
    },
  ],
  window: [
    { key: 'glazing', label: 'Glazing', options: ['Single', 'Double', 'Triple', 'Secondary', 'Unknown'] },
    { key: 'frame', label: 'Frame', options: ['uPVC', 'Timber', 'Aluminium', 'Composite', 'Steel'] },
  ],
  door: [
    {
      key: 'construction',
      label: 'Construction',
      options: ['Solid timber', 'Glazed timber', 'uPVC', 'Composite', 'Metal'],
    },
    { key: 'glazing', label: 'Glazing', options: ['None', 'Single', 'Double', 'Triple'] },
  ],
  opening: [],
  floor: [
    {
      key: 'construction',
      label: 'Construction',
      options: ['Solid', 'Suspended timber', 'Suspended concrete', 'Other'],
    },
    { key: 'insulation', label: 'Insulation', options: ['None', 'Partial', 'Insulated', 'Unknown'] },
  ],
  ceiling: [
    {
      key: 'construction',
      label: 'Above',
      options: ['Pitched roof (loft)', 'Room in roof', 'Flat roof', 'Heated space'],
    },
    {
      key: 'insulation',
      label: 'Insulation',
      options: ['None', 'Under 100 mm', '100–200 mm', '200–270 mm', 'Over 270 mm', 'Unknown'],
    },
  ],
  storage: [],
}
