import { Edges, OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type RootState, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Box3, DoubleSide, PerspectiveCamera, Vector3, type Group, type Mesh } from 'three'
import { alignmentOf, effectiveRole, useFabric } from '../fabric/store'
import { pivotOf } from '../scan/align'
import type { Role } from '../scan/classify'
import { geometryFor, meshMatrixOf } from '../scan/geometry'
import type { ScanElement } from '../scan/types'

/** Vertical gap added between storeys when they're spread apart (m). */
const STOREY_SPREAD = 2

interface Look {
  color: string
  opacity: number
}

const ROLE_WALL: Record<Role, Look> = {
  external: { color: '#d4693f', opacity: 1 },
  party: { color: '#8a72c9', opacity: 1 },
  internal: { color: '#b9bec4', opacity: 0.3 },
}

function lookFor(element: ScanElement, role: Role): Look {
  const dim = role === 'internal'
  switch (element.kind) {
    case 'wall':
      // Walls the viewer added to close gaps are drawn lighter, so they read as inferred.
      return element.synthetic ? { color: role === 'internal' ? '#cfd4da' : '#eba383', opacity: 0.85 } : ROLE_WALL[role]
    case 'window':
      return { color: '#4fa8e0', opacity: dim ? 0.35 : 0.9 }
    case 'door':
      return { color: '#7a4e33', opacity: dim ? 0.35 : 1 }
    case 'opening':
      return { color: '#e8c14f', opacity: 0.45 }
    case 'floor':
      return { color: dim ? '#cfd4da' : '#8f9aa6', opacity: dim ? 0.35 : 1 }
    case 'ceiling':
      return { color: dim ? '#cfd4da' : '#c4573a', opacity: dim ? 0.25 : 0.55 }
    case 'storage':
      return { color: '#d9b44a', opacity: 0.6 }
  }
}

function ElementMesh({ element }: { element: ScanElement }) {
  const parent = useFabric((s) => (element.parentId ? s.byId.get(element.parentId) : undefined))
  const role = useFabric((s) => effectiveRole(s, element.id))
  const selected = useFabric((s) => s.selectedId === element.id)
  const hovered = useFabric((s) => s.hoveredId === element.id)
  const select = useFabric((s) => s.select)
  const hover = useFabric((s) => s.hover)

  // Openings (doorless gaps such as archways) are cut out of their wall rather than drawn.
  const children = useFabric((s) => s.childrenOf.get(element.id))
  const openings = useMemo(() => (children ?? []).filter((c) => c.kind === 'opening'), [children])
  const geometry = useMemo(() => geometryFor(element, parent, openings), [element, parent, openings])
  const matrix = useMemo(() => meshMatrixOf(element), [element])
  useEffect(() => () => geometry.dispose(), [geometry])

  const look = lookFor(element, role)
  const flat = element.kind === 'floor' || element.kind === 'ceiling'

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select(element.id)
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hover(element.id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    if (useFabric.getState().hoveredId === element.id) hover(null)
    document.body.style.cursor = ''
  }

  return (
    <mesh
      geometry={geometry}
      matrix={matrix}
      matrixAutoUpdate={false}
      onClick={onClick}
      onPointerOver={onOver}
      onPointerOut={onOut}
      // Draw see-through internal elements after solid ones so they don't hide them.
      renderOrder={look.opacity < 1 ? 1 : 0}
    >
      <meshStandardMaterial
        color={look.color}
        transparent={look.opacity < 1}
        opacity={look.opacity}
        depthWrite={look.opacity >= 1}
        side={DoubleSide}
        emissive={selected ? '#ffd54a' : hovered ? '#ffffff' : '#000000'}
        emissiveIntensity={selected ? 0.55 : hovered ? 0.25 : 0}
        // Floors and ceilings share planes with each other; nudge them to avoid flicker.
        polygonOffset={flat}
        polygonOffsetFactor={element.kind === 'ceiling' ? -1 : 1}
        polygonOffsetUnits={1}
      />
      {selected && <Edges color="#1b1b1b" threshold={20} />}
    </mesh>
  )
}

function Building() {
  const scan = useFabric((s) => s.scan)
  const view = useFabric((s) => s.view)
  const elements = useFabric((s) => s.elements)
  const autoRoles = useFabric((s) => s.autoRoles)
  const byId = useFabric((s) => s.byId)
  const alignment = useFabric((s) => s.alignment)
  const roleOf = (id: string) => effectiveRole({ elements, autoRoles, byId }, id)

  if (!scan) return null

  return (
    <>
      {scan.stories.map((story, index) => {
        if (view.hiddenStories.includes(story)) return null
        const visible = scan.elements.filter((e) => {
          if (e.story !== story) return false
          // Openings are holes cut in their wall (see ElementMesh), not separate objects.
          if (e.kind === 'opening') return false
          if (e.kind === 'ceiling' && !view.showCeilings) return false
          if (e.kind === 'storage') return view.showStorage && !view.externalOnly
          if (view.externalOnly && roleOf(e.id) === 'internal') return false
          return true
        })
        // Line the storey up with the one below: rotate about its centre, then shift.
        const outline = scan.outlines.find((o) => o.story === story)
        const [px, pz] = outline ? pivotOf(outline) : [0, 0]
        const { rotation, dx, dz } = alignmentOf({ alignment }, story)
        return (
          <group key={story} position={[px + dx, view.spreadStoreys ? index * STOREY_SPREAD : 0, pz + dz]}>
            <group rotation={[0, (rotation * Math.PI) / 180, 0]}>
              <group position={[-px, 0, -pz]}>
                {visible.map((e) => (
                  <ElementMesh key={e.id} element={e} />
                ))}
              </group>
            </group>
          </group>
        )
      })}
    </>
  )
}

/** Directions the camera looks from. The 3D view is front-right and above, like a 3/4
 *  architectural view. The plan view is from directly above (tilted a hair so "up" stays defined). */
const VIEW_DIRECTIONS = {
  perspective: new Vector3(1, 0.85, 1.15).normalize(),
  plan: new Vector3(0, 1, 0.0001).normalize(),
}

/** Frames the building whenever a scan loads or the user resets the view. */
function FrameOnReset({ target }: { target: RefObject<Group | null> }) {
  const get = useThree((s) => s.get)
  const token = useFabric((s) => s.viewResetToken)

  useEffect(() => {
    // Wait two frames: when a scan first opens, the canvas mounts with it and isn't measured
    // yet, so the camera's aspect ratio would be wrong.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => frame(target.current, get()))
    })
    return () => cancelAnimationFrame(id)
  }, [get, target, token])

  return null
}

function frame(group: Group | null, state: RootState) {
  const camera = state.camera
  const controls = state.controls as unknown as { target: Vector3; update: () => void } | null
  if (!group || !(camera instanceof PerspectiveCamera)) return
  group.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(group)
  if (box.isEmpty()) return
  const center = box.getCenter(new Vector3())

  // Camera axes for the chosen view direction.
  const back = VIEW_DIRECTIONS[useFabric.getState().view.camera]
  const right = new Vector3(0, 1, 0).cross(back).normalize()
  const up = back.clone().cross(right)
  const tanV = Math.tan((camera.fov * Math.PI) / 360)
  const tanH = tanV * (state.size.width / Math.max(state.size.height, 1))

  // The closest distance at which every vertex is in view. (Fitting the bounding box instead
  // leaves the building small, as scans are rarely aligned with the world axes.)
  let distance = 0
  const point = new Vector3()
  group.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const positions = mesh.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(center)
      const depth = point.dot(back)
      distance = Math.max(
        distance,
        depth + Math.abs(point.dot(right)) / tanH,
        depth + Math.abs(point.dot(up)) / tanV,
      )
    }
  })
  distance *= 1.08

  camera.position.copy(center).addScaledVector(back, distance)
  camera.near = distance / 100
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  camera.lookAt(center)
  if (controls) {
    controls.target.copy(center)
    controls.update()
  }
}

export function Viewer() {
  const select = useFabric((s) => s.select)
  const building = useRef<Group>(null)
  return (
    <Canvas
      camera={{ position: [12, 10, 12], fov: 40, near: 0.05, far: 500 }}
      // Keeps the last frame readable so headless screenshots in development aren't blank.
      gl={{ preserveDrawingBuffer: import.meta.env.DEV }}
      onPointerMissed={() => select(null)}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#8d8d8d', 0.6]} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-6, 6, -8]} intensity={0.35} />
      <group ref={building}>
        <Building />
      </group>
      <OrbitControls makeDefault enableDamping />
      <FrameOnReset target={building} />
    </Canvas>
  )
}
