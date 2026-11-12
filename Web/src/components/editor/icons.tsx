import type { ReactNode } from 'react'
import { kindName, type ItemKind } from './kinds'

function Icon({ size = 18, label, className, children }: { size?: number; label?: string; className?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number; label?: string }

export const DoorIcon = (props: IconProps) => (
  <Icon {...props} className="icon-door">
    <path d="M4 21 H20" />
    <path d="M6 21 V4 H17 V21" />
    <circle cx="14" cy="13" r="0.9" fill="currentColor" />
  </Icon>
)

export const WindowIcon = (props: IconProps) => (
  <Icon {...props} className="icon-window">
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M12 4 V20 M4 12 H20" />
  </Icon>
)

export const SkylightIcon = (props: IconProps) => (
  <Icon {...props} className="icon-skylight">
    <path d="M3 19 L12 6 L21 19 Z" />
    <rect x="9.5" y="12" width="5" height="4" />
  </Icon>
)

export const PencilIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <path d="M4 20 L8.5 19 L19 8.5 L15.5 5 L5 15.5 Z" />
    <path d="M13.5 7 L17 10.5" />
  </Icon>
)

export const CheckIcon = (props: IconProps) => (
  <Icon size={14} {...props}>
    <path d="M4.5 12.75 L9.75 18 L19.5 6.75" />
  </Icon>
)

export const BackIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <path d="M19 12 H5" />
    <path d="M11 6 L5 12 L11 18" />
  </Icon>
)

export const BinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 7 H19" />
    <path d="M9 7 V4.5 H15 V7" />
    <path d="M7 7 L8 20 H16 L17 7" />
  </Icon>
)

export const HomeIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <path d="M3 11 L12 3.5 L21 11" />
    <path d="M5.5 9 V20.5 H18.5 V9" />
  </Icon>
)

export const SearchIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 L21 21" />
  </Icon>
)

export const ShareIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <path d="M12 15 V3.5" />
    <path d="M8 7.5 L12 3.5 L16 7.5" />
    <path d="M5 12 V20.5 H19 V12" />
  </Icon>
)

export const SaveIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <path d="M12 3.5 V15" />
    <path d="M8 11 L12 15 L16 11" />
    <path d="M4.5 20.5 H19.5" />
  </Icon>
)

export const ChevronIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <path d="M6 9 L12 15 L18 9" />
  </Icon>
)

export const InfoIcon = (props: IconProps) => (
  <Icon size={16} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11 V16.5" />
    <path d="M12 7.5 V7.6" />
  </Icon>
)

export function KindIcon({ kind, size }: { kind: ItemKind; size?: number }) {
  const label = kindName(kind)
  if (kind === 'door') return <DoorIcon size={size} label={label} />
  if (kind === 'window') return <WindowIcon size={size} label={label} />
  return <SkylightIcon size={size} label={label} />
}

/** A room's doors, windows and skylights as a row of small icons, doors first. */
export function ItemIcons({ kinds }: { kinds: ItemKind[] }) {
  const order: Record<ItemKind, number> = { door: 0, window: 1, skylight: 2 }
  if (!kinds.length) return null
  return (
    <span className="item-icons">
      {[...kinds]
        .sort((a, b) => order[a] - order[b])
        .map((kind, i) => (
          <span key={i} className="item-icon">
            <KindIcon kind={kind} />
          </span>
        ))}
    </span>
  )
}
