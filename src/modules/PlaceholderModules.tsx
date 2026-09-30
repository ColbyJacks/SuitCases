import type { ModuleId } from './registry'

const dim = { color: '#3a3d42', metalness: 0.6, roughness: 0.5 }

/** Stand-in props for modules that haven't been built yet. Swap each for the real thing. */
export function PlaceholderModule({ id }: { id: ModuleId }) {
  switch (id) {
    case 'faceswap':
      return (
        <group>
          <mesh castShadow position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.09, 0.1, 0.1, 40]} />
            <meshStandardMaterial {...dim} />
          </mesh>
          <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.065, 40]} />
            <meshStandardMaterial color="#0b1a2e" metalness={0.9} roughness={0.05} />
          </mesh>
        </group>
      )
    case 'heistai':
      return (
        <group>
          <mesh castShadow position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.1, 0.11, 0.06, 6]} />
            <meshStandardMaterial {...dim} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <sphereGeometry args={[0.05, 32, 16]} />
            <meshStandardMaterial color="#1b2a2a" emissive="#1f6f6a" emissiveIntensity={0.25} />
          </mesh>
        </group>
      )
    case 'alibi':
      return (
        <group rotation={[0, 0.15, 0]}>
          <mesh castShadow position={[0, 0.025, 0]}>
            <boxGeometry args={[0.2, 0.05, 0.15]} />
            <meshStandardMaterial color="#3b2a20" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.051, 0]}>
            <boxGeometry args={[0.17, 0.003, 0.12]} />
            <meshStandardMaterial color="#6b6252" roughness={1} />
          </mesh>
        </group>
      )
    case 'fakeid':
      return (
        <group rotation={[0, -0.2, 0]}>
          <mesh castShadow position={[0, 0.01, 0]}>
            <boxGeometry args={[0.2, 0.02, 0.13]} />
            <meshStandardMaterial {...dim} />
          </mesh>
          <mesh position={[0, 0.022, 0]}>
            <boxGeometry args={[0.17, 0.004, 0.105]} />
            <meshStandardMaterial color="#5a4a36" roughness={0.6} />
          </mesh>
        </group>
      )
    default:
      return (
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[0.22, 0.01, 0.18]} />
          <meshStandardMaterial color="#1a1b1d" roughness={1} />
        </mesh>
      )
  }
}
