import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Brass field-radar prop for the sixth suitcase slot. */
export function WatchtowerModule({ hovered, active }: { hovered: boolean; active: boolean }) {
  const sweep = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state, dt) => {
    const speed = active ? 2.8 : hovered ? 1.7 : 0.75
    if (sweep.current) sweep.current.rotation.y = state.clock.elapsedTime * speed
    if (glow.current) {
      glow.current.emissiveIntensity = THREE.MathUtils.damp(glow.current.emissiveIntensity, active ? 2.7 : hovered ? 1.8 : 0.75, 6, dt)
    }
  })

  return (
    <group rotation={[0, -0.18, 0]}>
      <mesh castShadow position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.105, 0.12, 0.05, 48]} />
        <meshStandardMaterial color="#24272b" metalness={0.92} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.09, 64]} />
        <meshStandardMaterial ref={glow} color="#062e27" emissive="#25e6b5" emissiveIntensity={0.75} roughness={0.25} toneMapped={false} />
      </mesh>
      {[0.03, 0.06, 0.088].map((r) => (
        <mesh key={r} position={[0, 0.054, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.0012, r + 0.0012, 48]} />
          <meshBasicMaterial color="#8effd9" transparent opacity={0.65} toneMapped={false} />
        </mesh>
      ))}
      <group ref={sweep} position={[0, 0.056, 0]}>
        <mesh position={[0, 0, -0.043]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.002, 0.086]} />
          <meshBasicMaterial color="#d5ffe9" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.006, 16, 12]} />
        <meshBasicMaterial color="#e8c76a" toneMapped={false} />
      </mesh>
      <mesh position={[0.072, 0.043, -0.032]}>
        <sphereGeometry args={[0.007, 16, 12]} />
        <meshBasicMaterial color="#ffcc66" toneMapped={false} />
      </mesh>
    </group>
  )
}
