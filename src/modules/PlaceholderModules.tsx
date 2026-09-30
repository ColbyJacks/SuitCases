import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { ModuleId } from './registry'

const gunmetal = new THREE.MeshStandardMaterial({ color: '#2b2e33', metalness: 0.9, roughness: 0.35 })

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

/** 3D props for modules whose logic lives entirely in their panel (HeistAI, Alibi). */
export function PlaceholderModule({ id, hovered }: { id: ModuleId; hovered: boolean }) {
  switch (id) {
    case 'heistai':
      return <Orb hovered={hovered} />
    case 'alibi':
      return <Notebook />
    default:
      return null
  }
}
