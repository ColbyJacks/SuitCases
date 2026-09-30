import { useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { MODULES, type ModuleId, type ModuleInfo } from '../modules/registry'
import { VoiceModulatorModule } from '../modules/VoiceModulatorModule'
import { PlaceholderModule } from '../modules/PlaceholderModules'
import { FakeIdModule } from '../modules/FakeIdModule'

const W = 1.2 // width
const D = 0.8 // depth
const H = 0.2 // base height
const LH = 0.1 // lid height
const T = 0.025 // wall thickness
const FOAM = 0.08
const OPEN_ANGLE = -1.95

const shell = { color: '#a4a9b0', metalness: 0.85, roughness: 0.3 }
const trim = { color: '#2b2d31', metalness: 0.7, roughness: 0.4 }
const brass = { color: '#c9a44c', metalness: 1, roughness: 0.25 }
const foam = { color: '#1c1d20', roughness: 1 }

type Props = {
  open: boolean
  onToggle: () => void
  activeModule: ModuleId | null
  onSelectModule: (m: ModuleInfo) => void
}

/** Open-top box made of five slabs, so the inside is actually hollow. */
function Shell({ height }: { height: number }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, T / 2, 0]}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial {...shell} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={`fb${s}`} castShadow receiveShadow position={[0, height / 2, (s * (D - T)) / 2]}>
          <boxGeometry args={[W, height, T]} />
          <meshStandardMaterial {...shell} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh key={`lr${s}`} castShadow receiveShadow position={[(s * (W - T)) / 2, height / 2, 0]}>
          <boxGeometry args={[T, height, D - 2 * T]} />
          <meshStandardMaterial {...shell} />
        </mesh>
      ))}
      {/* rubber trim along the seam */}
      {[1, -1].map((s) => (
        <mesh key={`tfb${s}`} position={[0, height - 0.004, (s * (D - T)) / 2]}>
          <boxGeometry args={[W + 0.006, 0.008, T + 0.006]} />
          <meshStandardMaterial {...trim} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh key={`tlr${s}`} position={[(s * (W - T)) / 2, height - 0.004, 0]}>
          <boxGeometry args={[T + 0.006, 0.008, D]} />
          <meshStandardMaterial {...trim} />
        </mesh>
      ))}
      {/* ribbing on the front face, flight-case style */}
      {[-0.4, 0, 0.4].map((x) => (
        <mesh key={x} position={[x, height / 2, D / 2 + 0.004]}>
          <boxGeometry args={[0.012, height * 0.8, 0.008]} />
          <meshStandardMaterial {...shell} roughness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function ModuleSlot({
  info,
  position,
  visible,
  active,
  onSelect,
}: {
  info: ModuleInfo
  position: [number, number, number]
  visible: boolean
  active: boolean
  onSelect: (m: ModuleInfo) => void
}) {
  const [hovered, setHovered] = useState(false)
  const lift = useRef<THREE.Group>(null)
  useCursor(hovered && visible)

  useFrame((_, dt) => {
    if (!lift.current) return
    const y = hovered || active ? 0.025 : 0
    lift.current.position.y = THREE.MathUtils.damp(lift.current.position.y, y, 12, dt)
  })

  return (
    <group position={position}>
      {/* recessed cut-out in the foam */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.3, 0.26]} />
        <meshStandardMaterial color={active ? '#2c2416' : '#0d0e10'} roughness={1} />
      </mesh>
      <group
        ref={lift}
        scale={1.25}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation()
          if (visible) onSelect(info)
        }}
      >
        {info.id === 'voice' ? (
          <VoiceModulatorModule hovered={hovered} active={active} />
        ) : info.id === 'fakeid' ? (
          <FakeIdModule hovered={hovered} active={active} />
        ) : (
          <PlaceholderModule id={info.id} />
        )}
        {/* invisible hit box so small props are easy to click */}
        <mesh position={[0, 0.06, 0]} visible={false}>
          <boxGeometry args={[0.3, 0.14, 0.26]} />
        </mesh>
      </group>
      {hovered && visible && (
        <Html position={[0, 0.2, 0]} center className="module-label" pointerEvents="none">
          <div className={info.ready ? 'ready' : 'offline'}>
            <strong>{info.name}</strong>
            <span>{info.ready ? info.tagline : 'Offline · coming soon'}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

export function Suitcase({ open, onToggle, activeModule, onSelectModule }: Props) {
  const lid = useRef<THREE.Group>(null)
  const latches = useRef<THREE.Group[]>([])
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  useFrame((_, dt) => {
    if (lid.current) {
      lid.current.rotation.x = THREE.MathUtils.damp(lid.current.rotation.x, open ? OPEN_ANGLE : 0, 4, dt)
    }
    for (const l of latches.current) {
      if (l) l.rotation.x = THREE.MathUtils.damp(l.rotation.x, open ? 1.2 : 0, 10, dt)
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onToggle()
  }

  const cols = 3
  const cellW = (W - 2 * T) / cols
  const cellD = (D - 2 * T) / 2

  return (
    <group>
      {/* base */}
      <group
        onClick={open ? undefined : handleClick}
        onPointerOver={() => !open && setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <Shell height={H} />

        {/* foam insert with module slots */}
        <mesh receiveShadow position={[0, T + FOAM / 2, 0]}>
          <boxGeometry args={[W - 2 * T, FOAM, D - 2 * T]} />
          <meshStandardMaterial {...foam} />
        </mesh>
        {MODULES.map((m, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = -W / 2 + T + cellW * (col + 0.5)
          const z = -D / 2 + T + cellD * (row + 0.5)
          return (
            <ModuleSlot
              key={m.id}
              info={m}
              position={[x, T + FOAM, z]}
              visible={open}
              active={activeModule === m.id}
              onSelect={onSelectModule}
            />
          )
        })}

        {/* carry handle */}
        <group position={[0, H * 0.55, D / 2 + 0.02]}>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 0, 0.01]} castShadow>
              <boxGeometry args={[0.03, 0.04, 0.04]} />
              <meshStandardMaterial {...trim} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.045]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.018, 0.22, 8, 16]} />
            <meshStandardMaterial {...trim} roughness={0.7} />
          </mesh>
        </group>

        {/* latches */}
        {[-0.38, 0.38].map((x, i) => (
          <group key={x} position={[x, H - 0.01, D / 2 + 0.008]}>
            <mesh>
              <boxGeometry args={[0.09, 0.05, 0.012]} />
              <meshStandardMaterial {...brass} />
            </mesh>
            <group
              ref={(g) => {
                if (g) latches.current[i] = g
              }}
              position={[0, -0.025, 0.01]}
            >
              <mesh position={[0, 0.03, 0]}>
                <boxGeometry args={[0.06, 0.06, 0.01]} />
                <meshStandardMaterial {...brass} roughness={0.15} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {/* lid, hinged on the back top edge */}
      <group ref={lid} position={[0, H, -D / 2]}>
        <group
          position={[0, 0, D / 2]}
          onClick={handleClick}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
          }}
          onPointerOut={() => setHovered(false)}
        >
          {/* shell flipped so its open side faces down */}
          <group position={[0, LH, 0]} rotation={[0, 0, Math.PI]}>
            <Shell height={LH} />
            <mesh position={[0, T + 0.02, 0]}>
              <boxGeometry args={[W - 2 * T, 0.04, D - 2 * T]} />
              <meshStandardMaterial {...foam} color="#141517" />
            </mesh>
          </group>
          {/* stencil plate on top */}
          <mesh position={[0, LH + 0.002, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.34, 0.08]} />
            <meshStandardMaterial {...brass} roughness={0.4} />
          </mesh>
        </group>
      </group>

      {hovered && (
        <Html position={[0, H + LH + 0.25, 0]} center className="case-hint" pointerEvents="none">
          {open ? 'Click the lid to close' : 'Click to open'}
        </Html>
      )}
    </group>
  )
}
