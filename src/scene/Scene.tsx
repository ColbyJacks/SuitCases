import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import {
  CameraControls,
  Environment,
  Lightformer,
  MeshReflectorMaterial,
  RoundedBox,
  Sparkles,
  SpotLight,
} from '@react-three/drei'
import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { Suitcase } from './Suitcase'
import { banknote, blueprint, walnut } from './textures'
import type { ModuleId, ModuleInfo } from '../modules/registry'

const TABLE_Y = 0.9
const CASE_POS: [number, number, number] = [0, TABLE_Y, -0.05]

function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.9} />
      </mesh>
      <mesh position={[0, 5, -5]}>
        <planeGeometry args={[40, 10]} />
        <meshStandardMaterial color="#0d0e11" roughness={1} />
      </mesh>
    </group>
  )
}

function Table() {
  const wood = useMemo(() => walnut(), [])
  const legs: [number, number][] = [
    [-1.3, -0.72],
    [1.3, -0.72],
    [-1.3, 0.72],
    [1.3, 0.72],
  ]
  return (
    <group>
      <RoundedBox args={[3, 0.08, 1.7]} radius={0.02} position={[0, TABLE_Y - 0.041, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={wood} color="#6b4a33" roughness={0.5} />
      </RoundedBox>
      {/* lacquered top that picks up soft reflections */}
      <mesh position={[0, TABLE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.96, 1.66]} />
        <MeshReflectorMaterial
          map={wood}
          color="#8a6448"
          blur={[400, 120]}
          resolution={512}
          mixBlur={1}
          mixStrength={2.2}
          mirror={0.35}
          roughness={0.55}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          metalness={0.2}
        />
      </mesh>
      {legs.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, (TABLE_Y - 0.08) / 2, z]} castShadow>
          <boxGeometry args={[0.07, TABLE_Y - 0.08, 0.07]} />
          <meshStandardMaterial color="#120c08" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function Blueprint() {
  const tex = useMemo(() => blueprint(), [])
  return (
    <mesh position={[-1.02, TABLE_Y + 0.003, 0.28]} rotation={[-Math.PI / 2, 0, 0.32]} receiveShadow>
      <planeGeometry args={[0.95, 0.65]} />
      <meshStandardMaterial map={tex} roughness={0.85} />
    </mesh>
  )
}

function CashStack({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const tex = useMemo(() => banknote(), [])
  const edge = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = '#c6cfb3'
    g.fillRect(0, 0, 64, 64)
    for (let y = 0; y < 64; y += 2) {
      g.fillStyle = `rgba(80,100,70,${0.2 + Math.random() * 0.3})`
      g.fillRect(0, y, 64, 1)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const mats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.9 })
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
    return [side, side, top, side, side, side]
  }, [edge, tex])
  return (
    <mesh position={position} rotation={[0, rotation, 0]} material={mats} castShadow receiveShadow>
      <boxGeometry args={[0.26, 0.045, 0.11]} />
    </mesh>
  )
}

function GoldBar({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.8, Math.SQRT1_2, 1, 4, 1)
    g.rotateY(Math.PI / 4)
    g.scale(0.16, 0.045, 0.07)
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} position={position} rotation={[0, rotation, 0]} castShadow>
      <meshStandardMaterial color="#f0c05a" metalness={1} roughness={0.18} envMapIntensity={2.5} />
    </mesh>
  )
}

function Loot() {
  return (
    <group>
      <CashStack position={[1.0, TABLE_Y + 0.0225, -0.1]} rotation={0.4} />
      <CashStack position={[1.02, TABLE_Y + 0.0675, -0.08]} rotation={0.25} />
      <CashStack position={[1.15, TABLE_Y + 0.0225, 0.2]} rotation={-0.3} />
      <GoldBar position={[0.82, TABLE_Y + 0.0225, 0.42]} rotation={0.2} />
      <GoldBar position={[0.97, TABLE_Y + 0.0225, 0.47]} rotation={0.25} />
      <GoldBar position={[0.9, TABLE_Y + 0.0675, 0.445]} rotation={0.22} />
    </group>
  )
}

function Lamp() {
  const light = useRef<THREE.SpotLight>(null)
  const shade = useMemo(() => {
    const pts = [
      [0.03, 0.2],
      [0.045, 0.16],
      [0.07, 0.12],
      [0.2, 0.02],
      [0.26, 0],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return new THREE.LatheGeometry(pts, 64)
  }, [])
  useEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.set(...CASE_POS)
    l.target.updateMatrixWorld()
  }, [])
  return (
    <group>
      <mesh geometry={shade} position={[0, 3.2, 0]}>
        <meshStandardMaterial color="#17181b" metalness={0.8} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.23, 0]}>
        <sphereGeometry args={[0.06, 24, 16]} />
        <meshStandardMaterial color="#fff" emissive="#ffe7bf" emissiveIntensity={6} toneMapped={false} />
      </mesh>
      <mesh position={[0, 4.4, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 2]} />
        <meshStandardMaterial color="#0c0c0c" />
      </mesh>
      <SpotLight
        ref={light}
        position={[0, 3.18, 0]}
        color="#ffe6bf"
        intensity={55}
        angle={0.4}
        penumbra={0.65}
        distance={6}
        decay={1.6}
        attenuation={3.4}
        anglePower={5}
        opacity={0.12}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
      />
      <Sparkles count={80} scale={[1.3, 2.3, 1.3]} position={[0, 2.05, 0]} size={1.6} speed={0.18} opacity={0.4} color="#ffe9c7" />
    </group>
  )
}

type Shot = { pos: [number, number, number]; target: [number, number, number] }
const SHOTS: Record<'intro' | 'closed' | 'open' | 'focus' | 'focusMobile', Shot> = {
  intro: { pos: [0, 3.9, 5.6], target: [0, 1.1, 0] },
  closed: { pos: [0, 1.9, 2.25], target: [0, 1.08, -0.02] },
  open: { pos: [0, 2.75, 1.45], target: [0, 1.02, -0.2] },
  focus: { pos: [0.5, 2.75, 1.6], target: [0.5, 1.0, -0.15] },
  focusMobile: { pos: [0, 4.65, 0.9], target: [0, 0.7, 0.71] },
}

/** Pull the camera back on narrow screens so the case still fits horizontally. */
function fit(s: Shot, aspect: number): [number, number, number, number, number, number] {
  const k = aspect < 1.25 ? Math.min(2.4, 1.25 / aspect) : 1
  const p = s.pos.map((v, i) => s.target[i] + (v - s.target[i]) * k)
  return [p[0], p[1], p[2], ...s.target]
}

function CameraRig({ open, focused }: { open: boolean; focused: boolean }) {
  const controls = useRef<CameraControls>(null)
  const size = useThree((s) => s.size)
  const introDone = useRef(false)

  useEffect(() => {
    const c = controls.current
    if (!c) return
    c.smoothTime = 0.9
    const s = SHOTS.intro
    c.setLookAt(...s.pos, ...s.target, false)
    const id = setTimeout(() => {
      introDone.current = true
      c.smoothTime = 1.4
        c.setLookAt(...fit(SHOTS.closed, window.innerWidth / window.innerHeight), true)
    }, 150)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const c = controls.current
    if (!c || !introDone.current) return
    c.smoothTime = 0.75
    const mobile = size.width < 700
    const s = focused ? (mobile ? SHOTS.focusMobile : SHOTS.focus) : open ? SHOTS.open : SHOTS.closed
    c.setLookAt(...(focused && mobile ? [...s.pos, ...s.target] as const : fit(s, size.width / size.height)), true)
  }, [open, focused, size.width, size.height])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={1.2}
      maxDistance={5}
      minPolarAngle={0.02}
      maxPolarAngle={1.3}
      minAzimuthAngle={-0.9}
      maxAzimuthAngle={0.9}
      truckSpeed={0}
      dollySpeed={0.4}
    />
  )
}

function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.85} luminanceSmoothing={0.2} radius={0.7} />
      <ChromaticAberration offset={new THREE.Vector2(0.0006, 0.0006)} radialModulation modulationOffset={0.4} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.78} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
    </EffectComposer>
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
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping }}
      camera={{ position: SHOTS.intro.pos, fov: 40, near: 0.05, far: 40 }}
    >
      <color attach="background" args={['#050608']} />
      <fog attach="fog" args={['#050608', 3.8, 10]} />
      <ambientLight intensity={0.05} color="#8aa0ff" />
      <pointLight position={[-3, 2.2, -2.5]} intensity={1.6} color="#3355ff" distance={7} />
      <pointLight position={[2.5, 1.4, -3]} intensity={1.2} color="#ff2a3a" distance={4.5} />
      <directionalLight position={[1.5, 1.8, 4]} intensity={0.25} color="#ffd9a8" />

      <Environment resolution={128} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-5, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, 1.2, 1]} color="#6d8cff" />
        <Lightformer form="rect" intensity={0.6} position={[5, 1.5, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[8, 1.2, 1]} color="#ffd6a0" />
        <Lightformer form="ring" intensity={1.2} position={[0, 2, 5]} scale={2} color="#ffffff" />
      </Environment>

      <Room />
      <Table />
      <Blueprint />
      <Loot />
      <Lamp />
      <group position={CASE_POS}>
        <Suitcase {...props} />
      </group>

      <CameraRig open={props.open} focused={props.activeModule !== null} />
      <Effects />
    </Canvas>
  )
}
