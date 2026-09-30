import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { ModuleId } from './registry'

const gunmetal = new THREE.MeshStandardMaterial({ color: '#2b2e33', metalness: 0.9, roughness: 0.35 })
const rubber = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.85 })

function Lens({ hovered }: { hovered: boolean }) {
  const glass = useRef<THREE.MeshPhysicalMaterial>(null)
  const barrel = useMemo(() => {
    const pts = [
      [0, 0],
      [0.1, 0],
      [0.1, 0.03],
      [0.094, 0.032],
      [0.094, 0.07],
      [0.098, 0.072],
      [0.098, 0.1],
      [0.08, 0.104],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return new THREE.LatheGeometry(pts, 64)
  }, [])
  useFrame((_, dt) => {
    if (glass.current) glass.current.iridescence = THREE.MathUtils.damp(glass.current.iridescence, hovered ? 1 : 0.6, 6, dt)
  })
  return (
    <group>
      <mesh geometry={barrel} material={gunmetal} castShadow />
      <mesh position={[0, 0.05, 0]} material={rubber}>
        <cylinderGeometry args={[0.097, 0.097, 0.03, 64, 1, true]} />
      </mesh>
      <mesh position={[0, 0.098, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[0.078, 48, 24, 0, Math.PI * 2, 0, 0.6]} />
        <meshPhysicalMaterial
          ref={glass}
          color="#0a1624"
          metalness={0.2}
          roughness={0.03}
          clearcoat={1}
          iridescence={0.6}
          iridescenceIOR={1.6}
          iridescenceThicknessRange={[200, 700]}
        />
      </mesh>
    </group>
  )
}

function Orb({ hovered }: { hovered: boolean }) {
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const halo = useRef<THREE.Mesh>(null)
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (core.current) core.current.emissiveIntensity = THREE.MathUtils.damp(core.current.emissiveIntensity, (hovered ? 3 : 1.2) + Math.sin(t * 2.4) * 0.4, 6, dt)
    if (halo.current) {
      halo.current.rotation.z = t * 0.9
      halo.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.4
    }
  })
  return (
    <group>
      <mesh position={[0, 0.02, 0]} material={gunmetal} castShadow>
        <cylinderGeometry args={[0.095, 0.105, 0.04, 6]} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.052, 48, 32]} />
        <meshStandardMaterial ref={core} color="#07201f" emissive="#3ff2d9" emissiveIntensity={1.2} roughness={0.2} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={[0, 0.1, 0]}>
        <torusGeometry args={[0.078, 0.003, 12, 64]} />
        <meshStandardMaterial color="#9ffff0" emissive="#3ff2d9" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Notebook() {
  return (
    <group rotation={[0, 0.18, 0]}>
      <RoundedBox args={[0.22, 0.04, 0.16]} radius={0.008} position={[0, 0.02, 0]} castShadow>
        <meshPhysicalMaterial color="#3a1f14" roughness={0.65} sheen={0.5} sheenColor="#7a4a33" />
      </RoundedBox>
      <mesh position={[0.004, 0.02, 0]}>
        <boxGeometry args={[0.212, 0.03, 0.152]} />
        <meshStandardMaterial color="#e9e1cf" roughness={1} />
      </mesh>
      <mesh position={[0.07, 0.041, 0]}>
        <boxGeometry args={[0.008, 0.003, 0.162]} />
        <meshStandardMaterial color="#111" roughness={0.6} />
      </mesh>
      <mesh position={[-0.03, 0.05, 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.006, 0.006, 0.17, 16]} />
        <meshStandardMaterial color="#c9a45a" metalness={1} roughness={0.25} />
      </mesh>
    </group>
  )
}

function IdCard({ hovered }: { hovered: boolean }) {
  const foil = useRef<THREE.MeshPhysicalMaterial>(null)
  useFrame((state) => {
    if (foil.current) foil.current.iridescenceIOR = 1.3 + Math.sin(state.clock.elapsedTime * (hovered ? 3 : 1)) * 0.3
  })
  return (
    <group rotation={[0, -0.22, 0]}>
      <RoundedBox args={[0.2, 0.006, 0.128]} radius={0.003} position={[0, 0.01, 0]} castShadow>
        <meshPhysicalMaterial ref={foil} color="#4a4740" roughness={0.65} iridescence={0.5} iridescenceIOR={1.3} envMapIntensity={0.3} />
      </RoundedBox>
      <mesh position={[-0.055, 0.0135, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.055, 0.07]} />
        <meshStandardMaterial color="#6b5d4c" roughness={0.8} />
      </mesh>
      {[0.03, 0.012, -0.006, -0.024].map((z, i) => (
        <mesh key={z} position={[0.035, 0.0135, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[i === 0 ? 0.08 : 0.06, 0.007]} />
          <meshStandardMaterial color={i === 0 ? '#e38b1f' : '#8a8578'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

/** Stand-in props for modules that haven't been built yet. */
export function PlaceholderModule({ id, hovered }: { id: ModuleId; hovered: boolean }) {
  switch (id) {
    case 'faceswap':
      return <Lens hovered={hovered} />
    case 'heistai':
      return <Orb hovered={hovered} />
    case 'alibi':
      return <Notebook />
    case 'fakeid':
      return <IdCard hovered={hovered} />
    default:
      return null
  }
}
