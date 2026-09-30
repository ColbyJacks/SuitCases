import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { faceSwapEngine } from '../vision/faceSwapEngine'

const body = { color: '#1d1f23', metalness: 0.7, roughness: 0.35 }
const chrome = { color: '#c9ccd1', metalness: 1, roughness: 0.18 }

/** Camera lens that glows while the face swap is live and turns green when it has locked onto a face. */
export function FaceSwapLensModule({ hovered, active }: { hovered: boolean; active: boolean }) {
  const glass = useRef<THREE.MeshStandardMaterial>(null)
  const led = useRef<THREE.MeshStandardMaterial>(null)
  const iris = useRef<THREE.Mesh>(null)

  useFrame((state, dt) => {
    const { running, tracking } = faceSwapEngine
    if (glass.current) {
      const target = running ? 0.9 + Math.sin(state.clock.elapsedTime * 3) * 0.2 : hovered || active ? 0.35 : 0.05
      glass.current.emissiveIntensity = THREE.MathUtils.damp(glass.current.emissiveIntensity, target, 8, dt)
    }
    if (led.current) {
      led.current.emissive.set(running && tracking ? '#35ff7a' : '#ff3b30')
      led.current.emissiveIntensity = THREE.MathUtils.damp(led.current.emissiveIntensity, running ? 2 : 0.15, 10, dt)
    }
    if (iris.current) {
      const s = running ? 0.6 : 1
      iris.current.scale.setScalar(THREE.MathUtils.damp(iris.current.scale.x, s, 6, dt))
    }
  })

  return (
    <group>
      {/* lens barrel */}
      <mesh castShadow position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.1, 0.11, 0.09, 48]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* knurled focus ring */}
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.106, 0.106, 0.022, 48, 1, true]} />
        <meshStandardMaterial color="#0e0f11" roughness={0.9} />
      </mesh>
      {/* chrome bezel */}
      <mesh position={[0, 0.092, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.085, 0.01, 16, 48]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      {/* iris blades (a dark ring that closes while live) */}
      <mesh ref={iris} position={[0, 0.093, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.03, 0.078, 6]} />
        <meshStandardMaterial color="#050506" roughness={0.6} />
      </mesh>
      {/* glass */}
      <mesh position={[0, 0.091, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.078, 48]} />
        <meshStandardMaterial ref={glass} color="#0b1a2e" emissive="#3a7bff" emissiveIntensity={0.05} metalness={0.9} roughness={0.05} />
      </mesh>
      {/* status LED */}
      <mesh position={[0.09, 0.07, 0.065]}>
        <sphereGeometry args={[0.009, 16, 16]} />
        <meshStandardMaterial ref={led} color="#ff3b30" emissive="#ff3b30" emissiveIntensity={0.15} />
      </mesh>
    </group>
  )
}
