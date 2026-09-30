import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { renderCard } from '../idcard/render'
import { cardStore } from '../idcard/store'
import { DEFAULT_TEMPLATE } from '../idcard/template'

/** A laminated crew ID on a card tray. Shows the last card you printed. */
export function FakeIdModule({ hovered, active }: { hovered: boolean; active: boolean }) {
  const card = useRef<THREE.Group>(null)
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])

  useEffect(() => {
    const show = (src: HTMLCanvasElement) => {
      const c = texture.image as HTMLCanvasElement
      c.width = src.width
      c.height = src.height
      c.getContext('2d')!.drawImage(src, 0, 0)
      texture.needsUpdate = true
    }
    const latest = cardStore.get()
    if (latest) show(latest)
    else {
      const blank = document.createElement('canvas')
      renderCard(blank, DEFAULT_TEMPLATE, { name: 'Your name here', codename: 'The Ghost', role: 'Mastermind', crewNo: 'RHC-000000', issued: '' }, null)
        .then(() => !cardStore.get() && show(blank))
        .catch(() => {})
    }
    const unsub = cardStore.subscribe(show)
    return () => {
      unsub()
      texture.dispose()
    }
  }, [texture])

  useFrame((_, dt) => {
    if (!card.current) return
    const tilt = hovered || active ? -0.35 : 0
    card.current.rotation.x = THREE.MathUtils.damp(card.current.rotation.x, tilt, 8, dt)
  })

  return (
    <group rotation={[0, -0.12, 0]}>
      {/* tray */}
      <mesh castShadow position={[0, 0.008, 0]}>
        <boxGeometry args={[0.21, 0.016, 0.14]} />
        <meshStandardMaterial color="#2a2c30" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* card, hinged at its back edge so it tilts up toward you on hover */}
      <group ref={card} position={[0, 0.018, -0.0535]}>
        <mesh castShadow position={[0, 0.001, 0.0535]}>
          <boxGeometry args={[0.17, 0.002, 0.107]} />
          <meshStandardMaterial color="#0c2340" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.0021, 0.0535]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.17, 0.107]} />
          <meshStandardMaterial map={texture} roughness={0.25} metalness={0.05} />
        </mesh>
      </group>
    </group>
  )
}
