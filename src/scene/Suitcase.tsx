import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, RoundedBox, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { MODULES, type ModuleId, type ModuleInfo } from '../modules/registry'
import { VoiceModulatorModule } from '../modules/VoiceModulatorModule'
import { PlaceholderModule } from '../modules/PlaceholderModules'
import { FaceSwapLensModule } from '../modules/FaceSwapLensModule'
import { FakeIdModule } from '../modules/FakeIdModule'
import { WatchtowerModule } from '../modules/WatchtowerModule'
import { Spring } from '../lib/spring'
import { brushedRoughness, dialNumbers, nameplate } from './textures'

const W = 1.2 // width
const D = 0.8 // depth
const H = 0.2 // base height
const LH = 0.1 // lid height
const T = 0.025 // wall thickness
const R = 0.07 // corner radius
const FOAM_LOW = 0.04
const FOAM_TOP = 0.05
const SLOT_W = 0.31
const SLOT_D = 0.29
const OPEN_ANGLE = -1.92

/**
 * Time since the case last opened or closed, counted in the same clamped steps
 * the springs use, so the open/close choreography keeps its order at any frame rate.
 */
function tickPhase(p: { open: boolean; time: number }, open: boolean, dt: number) {
  if (p.open !== open) {
    p.open = open
    p.time = 0
  } else p.time += Math.min(dt, 0.1)
  return p.time
}
const TRIM_H = 0.011
const COLS = 3
const CELL_W = (W - 2 * T) / COLS
const CELL_D = (D - 2 * T) / 2

function roundedRect(w: number, d: number, r: number, cx = 0, cz = 0) {
  const s = new THREE.Shape()
  const x = cx - w / 2
  const y = cz - d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function holePath(w: number, d: number, r: number, cx = 0, cz = 0) {
  const p = new THREE.Path()
  p.setFromPoints(roundedRect(w, d, r, cx, cz).getPoints(12))
  return p
}

/** Extrude a flat shape upward (along +y) by `height`. */
function extrudeUp(shape: THREE.Shape, height: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  return g
}

function useShellGeometry(height: number) {
  return useMemo(() => {
    const ring = roundedRect(W, D, R)
    ring.holes.push(holePath(W - 2 * T, D - 2 * T, R - T * 0.6))
    const walls = extrudeUp(ring, height, 0.006)
    const floor = extrudeUp(roundedRect(W - 0.01, D - 0.01, R), T)
    // Rubber gasket band around the outside of the rim. Its inner edge is buried in the
    // wall and its top sits below the wall top, so no faces are coplanar (no z-fighting).
    const trim = roundedRect(W + 0.014, D + 0.014, R + 0.007)
    trim.holes.push(holePath(W - 0.006, D - 0.006, R - 0.003))
    const trimGeo = extrudeUp(trim, TRIM_H, 0.003)
    return { walls, floor, trimGeo }
  }, [height])
}

function useMaterials() {
  return useMemo(() => {
    const rough = brushedRoughness()
    return {
      shell: new THREE.MeshPhysicalMaterial({
        color: '#d3d7dd',
        metalness: 0.7,
        roughness: 0.4,
        envMapIntensity: 2,
        roughnessMap: rough,
        clearcoat: 0.35,
        clearcoatRoughness: 0.25,
      }),
      trim: new THREE.MeshStandardMaterial({ color: '#15161a', metalness: 0.4, roughness: 0.55 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#e8eaee', metalness: 1, roughness: 0.12, envMapIntensity: 2.5 }),
      brass: new THREE.MeshStandardMaterial({ color: '#d7ad5c', metalness: 1, roughness: 0.22, envMapIntensity: 2.2 }),
      leather: new THREE.MeshPhysicalMaterial({ color: '#141414', roughness: 0.6, sheen: 0.6, sheenColor: '#3a3a3a' }),
      foam: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 1 }),
      foamTop: new THREE.MeshStandardMaterial({ color: '#1d1e22', roughness: 0.95 }),
      velvet: new THREE.MeshPhysicalMaterial({ color: '#2a0f12', roughness: 1, sheen: 1, sheenRoughness: 0.4, sheenColor: '#8a3a3f' }),
    }
  }, [])
}

type Materials = ReturnType<typeof useMaterials>

/** Chrome ball corners at the 4 corners of a shell of the given height. */
function Corners({ height, m, flip = false }: { height: number; m: Materials; flip?: boolean }) {
  const y = flip ? height : 0
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * (W / 2 - 0.012), y + (flip ? -0.018 : 0.018), sz * (D / 2 - 0.012)]}
            material={m.chrome}
            castShadow
          >
            <sphereGeometry args={[0.034, 24, 16]} />
          </mesh>
        )),
      )}
    </group>
  )
}

function Rivets({ y, m }: { y: number; m: Materials }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const points = useMemo(() => {
    const pts: [number, number, number][] = []
    for (let x = -0.5; x <= 0.5001; x += 0.1) {
      if (Math.abs(x) > 0.46 || Math.abs(Math.abs(x) - 0.38) < 0.06) continue
      pts.push([x, y, D / 2 + 0.003])
      pts.push([x, y, -D / 2 - 0.003])
    }
    return pts
  }, [y])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new THREE.Object3D()
    points.forEach((p, i) => {
      o.position.set(...p)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [points])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]} material={m.chrome}>
      <sphereGeometry args={[0.006, 10, 8]} />
    </instancedMesh>
  )
}

/** Egg-crate foam for the inside of the lid. */
function EggCrate({ m }: { m: Materials }) {
  const geo = useMemo(() => {
    const fw = W - 2 * T - 0.01
    const fd = D - 2 * T - 0.01
    const hw = fw / 2
    const hd = fd / 2
    const g = new THREE.PlaneGeometry(fw, fd, 90, 60)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      // flatten toward the edges so the foam meets the walls cleanly
      const edge = Math.min(1, (hw - Math.abs(x)) / 0.03, (hd - Math.abs(y)) / 0.03)
      pos.setZ(i, (Math.sin(x * 55) * Math.sin(y * 55) + 1) * 0.007 * Math.max(0, edge))
    }
    g.computeVertexNormals()
    return g
  }, [])
  return <mesh geometry={geo} material={m.foam} rotation={[-Math.PI / 2, 0, 0]} />
}

/** Foam insert with six cut-outs. */
function FoamInsert({ m }: { m: Materials }) {
  const topGeo = useMemo(() => {
    const s = roundedRect(W - 2 * T - 0.004, D - 2 * T - 0.004, R - T * 0.6)
    MODULES.forEach((_, i) => {
      const { x, z } = slotPosition(i)
      s.holes.push(holePath(SLOT_W, SLOT_D, 0.035, x, -z))
    })
    return extrudeUp(s, FOAM_TOP, 0.004)
  }, [])
  return (
    <group position={[0, T, 0]}>
      <mesh position={[0, FOAM_LOW / 2, 0]} material={m.velvet} receiveShadow>
        <boxGeometry args={[W - 2 * T - 0.01, FOAM_LOW, D - 2 * T - 0.01]} />
      </mesh>
      <mesh geometry={topGeo} position={[0, FOAM_LOW, 0]} material={m.foamTop} castShadow receiveShadow />
    </group>
  )
}

function slotPosition(i: number) {
  const col = i % COLS
  const row = Math.floor(i / COLS)
  return { x: -W / 2 + T + CELL_W * (col + 0.5), z: -D / 2 + T + CELL_D * (row + 0.5) }
}

function Dial({ m, spinTo, stiffness }: { m: Materials; spinTo: number; stiffness: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const spring = useRef(new Spring(0, stiffness, 10))
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: dialNumbers(), metalness: 0.3, roughness: 0.45 }), [])
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y = spring.current.step(spinTo, dt)
  })
  return (
    <mesh ref={ref} material={[mat, m.chrome, m.chrome]}>
      <cylinderGeometry args={[0.013, 0.013, 0.016, 32]} />
    </mesh>
  )
}

function ComboLock({ x, m, open }: { x: number; m: Materials; open: boolean }) {
  // Pre-rolled combination so each open lands on a different code.
  const code = useMemo(() => [3, 1, 7].map((d) => (d / 10) * Math.PI * 2), [])
  return (
    <group position={[x, H * 0.62, D / 2 + 0.012]}>
      <RoundedBox args={[0.085, 0.036, 0.012]} radius={0.005} material={m.chrome} />
      {[-0.024, 0, 0.024].map((dx, i) => (
        <group key={dx} position={[dx, 0, 0.004]} rotation={[0, 0, Math.PI / 2]}>
          <Dial m={m} spinTo={open ? code[i] + Math.PI * 4 : 0} stiffness={40 + i * 14} />
        </group>
      ))}
    </group>
  )
}

function Latch({ x, m, open }: { x: number; m: Materials; open: boolean }) {
  const lever = useRef<THREE.Group>(null)
  const spring = useRef(new Spring(0, 220, 16))
  useFrame((_, dt) => {
    if (lever.current) lever.current.rotation.x = spring.current.step(open ? 1.25 : 0, dt)
  })
  return (
    <group position={[x, H - 0.012, D / 2 + 0.006]}>
      <RoundedBox args={[0.1, 0.05, 0.012]} radius={0.005} material={m.chrome} castShadow />
      <group ref={lever} position={[0, -0.022, 0.009]}>
        <RoundedBox args={[0.07, 0.07, 0.01]} radius={0.004} position={[0, 0.032, 0]} material={m.brass} castShadow />
        <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.chrome}>
          <cylinderGeometry args={[0.006, 0.006, 0.075, 12]} />
        </mesh>
      </group>
    </group>
  )
}

type SlotProps = {
  info: ModuleInfo
  index: number
  open: boolean
  active: boolean
  onSelect: (m: ModuleInfo) => void
}

function ModuleSlot({ info, index, open, active, onSelect }: SlotProps) {
  const [hovered, setHovered] = useState(false)
  const lift = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshStandardMaterial>(null)
  const rise = useRef(new Spring(-0.06, 90, 11))
  const hover = useRef(new Spring(0, 200, 18))
  const phase = useRef({ open, time: 0 })
  useCursor(hovered && open)
  const { x, z } = slotPosition(index)

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const since = tickPhase(phase.current, open, dt)
    const released = open && since > 0.55 + index * 0.07
    rise.current.stiffness = open ? 90 : 260
    rise.current.damping = open ? 11 : 32
    const base = rise.current.step(released ? 0 : -0.06, dt)
    const up = hover.current.step(open && (hovered || active) ? 0.03 : 0, dt)
    if (lift.current) {
      lift.current.position.y = base + up + (active ? Math.sin(t * 2) * 0.004 : 0)
      lift.current.rotation.y = THREE.MathUtils.damp(lift.current.rotation.y, active ? Math.sin(t * 0.8) * 0.15 : 0, 4, dt)
    }
    if (glow.current) {
      const target = !open ? 0 : active ? 2.4 : hovered ? 1.6 : info.ready ? 0.22 : 0
      glow.current.emissiveIntensity = THREE.MathUtils.damp(glow.current.emissiveIntensity, target, 8, dt)
    }
  })

  return (
    <group position={[x, T + FOAM_LOW, z]}>
      {/* under-glow at the bottom of the cut-out */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SLOT_W - 0.02, SLOT_D - 0.02]} />
        <meshStandardMaterial ref={glow} color="#0a0708" emissive="#e3a24a" emissiveIntensity={0} roughness={1} />
      </mesh>
      <group
        ref={lift}
        scale={1.1}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation()
          if (open) onSelect(info)
        }}
      >
        {info.id === 'voice' ? (
          <VoiceModulatorModule hovered={hovered} active={active} />
        ) : info.id === 'faceswap' ? (
          <FaceSwapLensModule hovered={hovered} active={active} />
        ) : info.id === 'fakeid' ? (
          <FakeIdModule hovered={hovered} active={active} />
        ) : info.id === 'watchtower' ? (
          <WatchtowerModule hovered={hovered} active={active} />
        ) : (
          <PlaceholderModule id={info.id} hovered={hovered} />
        )}
        <mesh position={[0, 0.07, 0]} visible={false}>
          <boxGeometry args={[0.26, 0.16, 0.24]} />
        </mesh>
      </group>
      {hovered && open && !active && (
        <Html position={[0, 0.24, 0]} center pointerEvents="none" zIndexRange={[20, 0]}>
          <div className="pointer-events-none flex -translate-y-1 animate-[fadeIn_.2s_ease-out] flex-col items-center gap-0.5 whitespace-nowrap rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-center shadow-2xl backdrop-blur-md">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold/80">{info.code}</span>
            <span className="text-[13px] font-medium text-paper">{info.name}</span>
            <span className="text-[11px] text-mute">{info.ready ? info.tagline : 'Offline · coming soon'}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

type Props = {
  open: boolean
  onToggle: () => void
  activeModule: ModuleId | null
  onSelectModule: (m: ModuleInfo) => void
}

export function Suitcase({ open, onToggle, activeModule, onSelectModule }: Props) {
  const m = useMaterials()
  const base = useShellGeometry(H)
  const lidGeo = useShellGeometry(LH)
  const lid = useRef<THREE.Group>(null)
  const lidSpring = useRef(new Spring(0, 38, 7.5))
  const phase = useRef({ open, time: 0 })
  const led = useRef<THREE.MeshStandardMaterial>(null)
  const inner = useRef<THREE.PointLight>(null)
  const hoverLift = useRef(new Spring(0, 160, 14))
  const body = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const plate = useMemo(() => nameplate('RH·26', 'PROPERTY OF THE CREW'), [])

  useFrame((_, dt) => {
    const since = tickPhase(phase.current, open, dt)
    // Opening: latches pop first, then the lid swings. Closing: modules sink first.
    const lidGo = open && since > 0.28
    const spring = lidSpring.current
    const lidHold = !open && since < 0.22 && spring.value < -0.05
    let angle = spring.step(lidGo || lidHold ? OPEN_ANGLE : 0, dt)
    if (angle > 0) {
      // lid meets the base: stop dead with a tiny settle instead of passing through
      angle = spring.value = 0
      spring.velocity = Math.min(0, -spring.velocity * 0.15)
    }
    if (lid.current) lid.current.rotation.x = Math.max(angle, OPEN_ANGLE - 0.12)
    const openness = THREE.MathUtils.clamp(angle / OPEN_ANGLE, 0, 1)
    if (led.current) led.current.emissiveIntensity = openness * 4
    if (inner.current) inner.current.intensity = openness * 1.6
    if (body.current) body.current.position.y = hoverLift.current.step(hovered && !open ? 0.012 : 0, dt)
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onToggle()
  }

  return (
    <group ref={body}>
      {/* soft contact shadow */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W * 1.35, D * 1.45]} />
        <meshBasicMaterial transparent opacity={0.55} color="#000" alphaMap={contactShadow()} depthWrite={false} />
      </mesh>

      {/* base */}
      <group
        onClick={open ? undefined : click}
        onPointerOver={() => !open && setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <mesh geometry={base.walls} material={m.shell} castShadow receiveShadow />
        <mesh geometry={base.floor} material={m.shell} receiveShadow />
        <mesh geometry={base.trimGeo} position={[0, H - 0.003 - TRIM_H, 0]} material={m.trim} />
        <Corners height={H} m={m} />
        <Rivets y={H - 0.03} m={m} />
        <FoamInsert m={m} />
        <pointLight ref={inner} position={[0, 0.45, 0.15]} color="#ffcf8a" intensity={0} distance={1.4} decay={2} />

        {/* carry handle */}
        <group position={[0, H * 0.3, D / 2 + 0.012]}>
          {[-0.15, 0.15].map((x) => (
            <RoundedBox key={x} args={[0.04, 0.035, 0.03]} radius={0.008} position={[x, 0, 0.008]} material={m.chrome} castShadow />
          ))}
          <mesh position={[0, -0.004, 0.05]} rotation={[0, 0, Math.PI / 2]} material={m.leather} castShadow>
            <capsuleGeometry args={[0.02, 0.24, 8, 20]} />
          </mesh>
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} position={[x, -0.004, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={m.chrome}>
              <torusGeometry args={[0.018, 0.005, 10, 24]} />
            </mesh>
          ))}
        </group>

        <ComboLock x={-0.26} m={m} open={open} />
        <ComboLock x={0.26} m={m} open={open} />
        <Latch x={-0.42} m={m} open={open} />
        <Latch x={0.42} m={m} open={open} />
      </group>

      {/* lid, hinged on the back top edge */}
      <group ref={lid} position={[0, H, -D / 2]}>
        {/* piano hinge */}
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, -0.004]} material={m.chrome}>
          <cylinderGeometry args={[0.008, 0.008, W - 0.16, 16]} />
        </mesh>
        <group
          position={[0, 0, D / 2]}
          onClick={click}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        >
          <group position={[0, LH, 0]} rotation={[0, 0, Math.PI]}>
            <mesh geometry={lidGeo.walls} material={m.shell} castShadow receiveShadow />
            <mesh geometry={lidGeo.floor} material={m.shell} castShadow />
            <mesh geometry={lidGeo.trimGeo} position={[0, LH - 0.003 - TRIM_H, 0]} material={m.trim} />
            <group position={[0, T + 0.001, 0]}>
              <EggCrate m={m} />
            </group>
            <Rivets y={LH - 0.03} m={m} />
            {/* warm LED strip along the front inner edge */}
            <mesh position={[0, LH - 0.02, D / 2 - T - 0.006]}>
              <boxGeometry args={[W - 0.2, 0.006, 0.006]} />
              <meshStandardMaterial ref={led} color="#ffe2b0" emissive="#ffb866" emissiveIntensity={0} toneMapped={false} />
            </mesh>
          </group>
          <Corners height={LH} m={m} flip />
          {/* raised ribs on the lid top */}
          {[-0.28, 0.28].map((x) => (
            <RoundedBox key={x} args={[0.05, 0.012, D - 0.14]} radius={0.005} position={[x, LH + 0.004, 0]} material={m.shell} castShadow />
          ))}
          <mesh position={[0, LH + 0.0025, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 0.075]} />
            <meshStandardMaterial map={plate} metalness={1} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {MODULES.map((info, i) => (
        <ModuleSlot
          key={info.id}
          info={info}
          index={i}
          open={open}
          active={activeModule === info.id}
          onSelect={onSelectModule}
        />
      ))}
    </group>
  )
}

let shadowTex: THREE.Texture | null = null
function contactShadow() {
  if (shadowTex) return shadowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64)
  grad.addColorStop(0, '#fff')
  grad.addColorStop(1, '#000')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  shadowTex = new THREE.CanvasTexture(c)
  return shadowTex
}
