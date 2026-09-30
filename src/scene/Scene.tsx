import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, Sparkles, SpotLight } from '@react-three/drei'
import * as THREE from 'three'
import { Suitcase } from './Suitcase'
import type { ModuleId, ModuleInfo } from '../modules/registry'

const TABLE_Y = 0.9

function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#0e0f11" roughness={0.95} />
      </mesh>
      <mesh position={[0, 4, -5]} receiveShadow>
        <planeGeometry args={[30, 8]} />
        <meshStandardMaterial color="#121315" roughness={1} />
      </mesh>
    </group>
  )
}

function Table() {
  const wood = { color: '#3a2618', roughness: 0.7, metalness: 0.05 }
  const legs: [number, number][] = [
    [-1.25, -0.7],
    [1.25, -0.7],
    [-1.25, 0.7],
    [1.25, 0.7],
  ]
  return (
    <group>
      <mesh position={[0, TABLE_Y - 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.08, 1.6]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {legs.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, (TABLE_Y - 0.08) / 2, z]} castShadow>
          <boxGeometry args={[0.08, TABLE_Y - 0.08, 0.08]} />
          <meshStandardMaterial {...wood} />
        </mesh>
      ))}
    </group>
  )
}

/** A vault blueprint drawn onto a canvas, lying on the table. */
function Blueprint() {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 700
    const g = c.getContext('2d')!
    g.fillStyle = '#123a6b'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let x = 0; x < c.width; x += 32) g.strokeRect(x, 0, 0, c.height)
    for (let y = 0; y < c.height; y += 32) g.strokeRect(0, y, c.width, 0)
    g.strokeStyle = 'rgba(220,235,255,0.85)'
    g.lineWidth = 5
    g.strokeRect(80, 80, 860, 520)
    g.strokeRect(80, 80, 300, 240)
    g.strokeRect(620, 360, 320, 240)
    g.beginPath()
    g.arc(780, 480, 70, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = 3
    g.setLineDash([14, 10])
    g.strokeStyle = '#ff5a5a'
    g.beginPath()
    g.moveTo(230, 320)
    g.lineTo(230, 480)
    g.lineTo(700, 480)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = 'rgba(220,235,255,0.9)'
    g.font = 'bold 36px monospace'
    g.fillText('FIRST NATIONAL — LEVEL B2', 400, 60)
    g.font = '26px monospace'
    g.fillText('VAULT', 740, 580)
    g.fillText('ENTRY', 180, 200)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])

  return (
    <mesh position={[-0.85, TABLE_Y + 0.002, 0.35]} rotation={[-Math.PI / 2, 0, 0.35]} receiveShadow>
      <planeGeometry args={[0.9, 0.62]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  )
}

function Lamp() {
  const light = useRef<THREE.SpotLight>(null)

  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.set(0, TABLE_Y, 0)
    l.target.updateMatrixWorld()
  }, [])

  return (
    <group>
      {/* shade + bulb */}
      <mesh position={[0, 3.35, 0]}>
        <coneGeometry args={[0.28, 0.25, 32, 1, true]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.26, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color="#fff4d6" emissive="#fff1c7" emissiveIntensity={4} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 2.2]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <SpotLight
        ref={light}
        position={[0, 3.25, 0]}
        color="#ffe9c4"
        intensity={45}
        angle={0.42}
        penumbra={0.55}
        distance={6}
        decay={1.6}
        attenuation={3.2}
        anglePower={4}
        opacity={0.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
      />
      <Sparkles count={60} scale={[1.2, 2.2, 1.2]} position={[0, 2.1, 0]} size={1.5} speed={0.2} opacity={0.35} color="#fff3d0" />
    </group>
  )
}

type Props = {
  open: boolean
  onToggle: () => void
  activeModule: ModuleId | null
  onSelectModule: (m: ModuleInfo) => void
}

export function Scene(props: Props) {
  return (
    <Canvas shadows camera={{ position: [0, 2.35, 2.25], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={['#050506']} />
      <fog attach="fog" args={['#050506', 3.5, 9]} />
      <ambientLight intensity={0.06} color="#8aa0ff" />
      <pointLight position={[-3, 2, -3]} intensity={3} color="#3a5bff" />
      <directionalLight position={[1.5, 1.6, 4]} intensity={0.35} color="#ffd9a8" />

      {/* procedural reflections so the metal case reads as metal, no HDR download */}
      <Environment resolution={64} environmentIntensity={0.6}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[4, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[-5, 1, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 2, 1]} color="#6d8cff" />
        <Lightformer form="rect" intensity={0.4} position={[5, 1, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 2, 1]} />
      </Environment>

      <Room />
      <Table />
      <Blueprint />
      <Lamp />
      <group position={[0.1, TABLE_Y, -0.05]}>
        <Suitcase {...props} />
      </group>

      <OrbitControls
        target={[0, TABLE_Y + 0.15, 0]}
        enablePan={false}
        minDistance={1.3}
        maxDistance={4.5}
        minPolarAngle={0.2}
        maxPolarAngle={1.35}
        enableDamping
      />
    </Canvas>
  )
}
