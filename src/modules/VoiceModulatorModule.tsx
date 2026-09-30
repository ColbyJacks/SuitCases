import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { voiceEngine } from '../audio/voiceEngine'
import { grilleAlpha } from '../scene/textures'

/** Vintage bronze speaker whose cone and VU light follow your disguised voice. */
export function VoiceModulatorModule({ hovered, active }: { hovered: boolean; active: boolean }) {
  const cone = useRef<THREE.Group>(null)
  const led = useRef<THREE.MeshStandardMaterial>(null)
  const ring = useRef<THREE.MeshStandardMaterial>(null)

  const { housing, bronze, darkBronze, grille } = useMemo(() => {
    const profile = [
      [0, 0],
      [0.128, 0],
      [0.132, 0.008],
      [0.13, 0.03],
      [0.122, 0.07],
      [0.118, 0.086],
      [0.11, 0.09],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return {
      housing: new THREE.LatheGeometry(profile, 72),
      bronze: new THREE.MeshPhysicalMaterial({ color: '#b27a3e', metalness: 1, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
      darkBronze: new THREE.MeshStandardMaterial({ color: '#5a3a1c', metalness: 1, roughness: 0.45 }),
      grille: new THREE.MeshStandardMaterial({
        color: '#c9955a',
        metalness: 1,
        roughness: 0.35,
        alphaMap: grilleAlpha(),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
    }
  }, [])

  useFrame((state, dt) => {
    const level = voiceEngine.getLevel()
    if (cone.current) {
      cone.current.position.y = THREE.MathUtils.damp(cone.current.position.y, 0.066 + level * 0.018, 30, dt)
    }
    if (led.current) {
      const on = voiceEngine.running ? 2 + level * 10 : hovered || active ? 1.2 : 0.2
      led.current.emissiveIntensity = THREE.MathUtils.damp(led.current.emissiveIntensity, on, 12, dt)
    }
    if (ring.current) {
      const pulse = active ? 0.8 + Math.sin(state.clock.elapsedTime * 3) * 0.4 : hovered ? 0.6 : 0
      ring.current.emissiveIntensity = THREE.MathUtils.damp(ring.current.emissiveIntensity, pulse + level * 3, 10, dt)
    }
  })

  return (
    <group>
      <mesh geometry={housing} material={bronze} castShadow receiveShadow />
      {/* knurled bezel */}
      <mesh position={[0, 0.092, 0]} material={bronze}>
        <cylinderGeometry args={[0.112, 0.112, 0.01, 96, 1, true]} />
      </mesh>
      <mesh position={[0, 0.097, 0]} rotation={[Math.PI / 2, 0, 0]} material={bronze}>
        <torusGeometry args={[0.107, 0.006, 16, 72]} />
      </mesh>
      {/* glowing ring behind the grille */}
      <mesh position={[0, 0.094, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.094, 0.1, 72]} />
        <meshStandardMaterial ref={ring} color="#2a1606" emissive="#ffae4a" emissiveIntensity={0} toneMapped={false} />
      </mesh>
      {/* cone + dust cap */}
      <group ref={cone} position={[0, 0.066, 0]}>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, 0, 0]}>
          <coneGeometry args={[0.094, 0.045, 64, 1, true]} />
          <meshStandardMaterial color="#1a120b" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.012, 0]} material={darkBronze}>
          <sphereGeometry args={[0.026, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
      {/* perforated grille */}
      <mesh position={[0, 0.098, 0]} rotation={[-Math.PI / 2, 0, 0]} material={grille}>
        <circleGeometry args={[0.1, 72]} />
      </mesh>
      {/* VU lamp */}
      <mesh position={[0.098, 0.05, 0.075]}>
        <sphereGeometry args={[0.01, 16, 16]} />
        <meshStandardMaterial ref={led} color="#ff5a1f" emissive="#ff4a14" emissiveIntensity={0.2} toneMapped={false} />
      </mesh>
      {/* toggle */}
      <mesh position={[-0.1, 0.05, 0.07]} rotation={[0.5, 0, 0]} material={darkBronze}>
        <cylinderGeometry args={[0.004, 0.004, 0.03, 10]} />
      </mesh>
    </group>
  )
}
