import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { voiceEngine } from '../audio/voiceEngine'

const bronze = { color: '#b07a3c', metalness: 1, roughness: 0.32 }

/** Bronze speaker that thumps along with your (disguised) voice. */
export function VoiceModulatorModule({ hovered, active }: { hovered: boolean; active: boolean }) {
  const cone = useRef<THREE.Group>(null)
  const led = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((_, dt) => {
    const level = voiceEngine.getLevel()
    if (cone.current) {
      const target = 0.09 + level * 0.02
      cone.current.position.y = THREE.MathUtils.damp(cone.current.position.y, target, 25, dt)
    }
    if (led.current) {
      const on = voiceEngine.running ? 1.5 + level * 6 : hovered || active ? 0.8 : 0.15
      led.current.emissiveIntensity = THREE.MathUtils.damp(led.current.emissiveIntensity, on, 10, dt)
    }
  })

  return (
    <group>
      {/* housing */}
      <mesh castShadow position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.12, 0.13, 0.09, 48]} />
        <meshStandardMaterial {...bronze} />
      </mesh>
      {/* front rim */}
      <mesh position={[0, 0.092, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.105, 0.012, 16, 48]} />
        <meshStandardMaterial {...bronze} roughness={0.2} />
      </mesh>
      {/* cone, opening upward; moves with the voice */}
      <group ref={cone} position={[0, 0.09, 0]}>
        <mesh position={[0, -0.025, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.095, 0.05, 48, 1, true]} />
          <meshStandardMaterial color="#2a1c10" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.035, 0]}>
          <sphereGeometry args={[0.028, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial {...bronze} />
        </mesh>
      </group>
      {/* grille bars */}
      {[-0.06, -0.03, 0, 0.03, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.098, 0]}>
          <boxGeometry args={[0.005, 0.004, 2 * Math.sqrt(0.1 ** 2 - x ** 2)]} />
          <meshStandardMaterial {...bronze} />
        </mesh>
      ))}
      {/* status LED */}
      <mesh position={[0.1, 0.07, 0.07]}>
        <sphereGeometry args={[0.009, 16, 16]} />
        <meshStandardMaterial ref={led} color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={0.15} />
      </mesh>
    </group>
  )
}
