import type { Point2 } from '../scan/outline'

interface PlanSvgProps {
  /** Each storey's outlines, lowest first, in metres (x across, z down the page). */
  storeys: Point2[][][]
  /** Another home's outlines placed over these, drawn as a dashed line. */
  overlay?: Point2[][][]
  /** Turns everything (radians) so the main walls run across and down the page. */
  rotation?: number
  labels?: string[]
  title: string
  className?: string
}

/** Gap between storeys drawn side by side (m). */
const GAP = 1.5

function rotate([x, z]: Point2, r: number): Point2 {
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [x * c - z * s, x * s + z * c]
}

interface Panel {
  index: number
  minX: number
  minZ: number
  dx: number
  dz: number
  width: number
}

/** Lays storeys out left to right with their tops aligned. */
function layout(own: Point2[][][], theirs: Point2[][][], count: number) {
  const panels: Panel[] = []
  let cursor = 0
  let height = 0
  for (let i = 0; i < count; i++) {
    const points = [...(own[i] ?? []).flat(), ...(theirs[i] ?? []).flat()]
    if (!points.length) continue
    const minX = Math.min(...points.map((p) => p[0]))
    const maxX = Math.max(...points.map((p) => p[0]))
    const minZ = Math.min(...points.map((p) => p[1]))
    const maxZ = Math.max(...points.map((p) => p[1]))
    panels.push({ index: i, minX, minZ, dx: cursor - minX, dz: -minZ, width: maxX - minX })
    cursor += maxX - minX + GAP
    height = Math.max(height, maxZ - minZ)
  }
  return { panels, width: cursor - GAP, height }
}

const path = (points: Point2[]) => `M${points.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join('L')}Z`

/** A schematic floorplan: each storey's outline side by side, optionally with another home's on top. */
export function PlanSvg({ storeys, overlay, rotation = 0, labels = [], title, className }: PlanSvgProps) {
  const count = Math.max(storeys.length, overlay?.length ?? 0)
  const rotated = (plans: Point2[][][] | undefined) =>
    (plans ?? []).map((storey) => storey.map((outline) => outline.map((p) => rotate(p, rotation))))
  const own = rotated(storeys)
  const theirs = rotated(overlay)

  const { panels, width, height } = layout(own, theirs, count)
  if (!panels.length) return null
  const labelSize = Math.max(0.5, height * 0.09)
  const pad = labelSize * 0.6
  const viewHeight = height + (labels.length ? labelSize * 1.6 : 0)

  return (
    <svg
      className={`plan ${className ?? ''}`}
      viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${viewHeight + 2 * pad}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {panels.map(({ index, minX, minZ, dx, dz, width: w }) => (
        <g key={index} transform={`translate(${dx} ${dz})`}>
          {(own[index] ?? []).map((outline, k) => (
            <path key={`own-${k}`} d={path(outline)} className="plan-own" vectorEffect="non-scaling-stroke" />
          ))}
          {(theirs[index] ?? []).map((outline, k) => (
            <path key={`theirs-${k}`} d={path(outline)} className="plan-theirs" vectorEffect="non-scaling-stroke" />
          ))}
          {labels[index] && (
            // Centred under the storey, below the tallest storey so labels line up.
            <text
              x={minX + w / 2}
              y={minZ + height + labelSize * 1.3}
              fontSize={labelSize}
              textAnchor="middle"
              className="plan-label"
            >
              {labels[index]}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
