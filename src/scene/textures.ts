import * as THREE from 'three'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function finish(c: HTMLCanvasElement, color = true, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(...repeat)
  }
  return t
}

const cache = new Map<string, THREE.Texture>()
function memo(key: string, make: () => THREE.Texture) {
  let t = cache.get(key)
  if (!t) {
    t = make()
    cache.set(key, t)
  }
  return t
}

/** Horizontal streaks for brushed aluminum, used as a roughness map. */
export const brushedRoughness = () =>
  memo('brushed', () => {
    const [c, g] = canvas(512, 512)
    g.fillStyle = '#6a6a6a'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 2600; i++) {
      const v = 70 + Math.random() * 90
      g.strokeStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.35})`
      g.lineWidth = Math.random() * 1.4
      const y = Math.random() * 512
      const x = Math.random() * 512
      g.beginPath()
      g.moveTo(x - 200, y)
      g.lineTo(x + 200 + Math.random() * 200, y + (Math.random() - 0.5) * 2)
      g.stroke()
    }
    return finish(c, false, [2, 2])
  })

/** Dark lacquered walnut for the tabletop. */
export const walnut = () =>
  memo('walnut', () => {
    const [c, g] = canvas(1024, 512)
    const grad = g.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, '#1d120b')
    grad.addColorStop(1, '#140c07')
    g.fillStyle = grad
    g.fillRect(0, 0, 1024, 512)
    for (let i = 0; i < 180; i++) {
      const y0 = Math.random() * 512
      const amp = 4 + Math.random() * 14
      const freq = 0.002 + Math.random() * 0.006
      const phase = Math.random() * 10
      g.strokeStyle = `rgba(${60 + Math.random() * 40},${35 + Math.random() * 20},${18},${0.08 + Math.random() * 0.18})`
      g.lineWidth = 0.6 + Math.random() * 2.2
      g.beginPath()
      for (let x = 0; x <= 1024; x += 8) {
        const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.3
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    return finish(c, true, [1, 1])
  })

/** Perforated speaker grille: opaque metal with round holes (alpha map). */
export const grilleAlpha = () =>
  memo('grille', () => {
    const [c, g] = canvas(256, 256)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#000'
    const step = 12
    for (let y = 0; y < 256; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < 256; x += step) {
        g.beginPath()
        g.arc(x, y, 3.6, 0, Math.PI * 2)
        g.fill()
      }
    }
    return finish(c, false)
  })

/** Engraved brass nameplate. */
export const nameplate = (text: string, sub: string) =>
  memo(`plate:${text}:${sub}`, () => {
    const [c, g] = canvas(512, 128)
    const grad = g.createLinearGradient(0, 0, 512, 128)
    grad.addColorStop(0, '#8a6a32')
    grad.addColorStop(0.45, '#e5c07a')
    grad.addColorStop(0.55, '#f3d79a')
    grad.addColorStop(1, '#7b5b27')
    g.fillStyle = grad
    g.fillRect(0, 0, 512, 128)
    g.strokeStyle = 'rgba(40,25,5,0.7)'
    g.lineWidth = 3
    g.strokeRect(10, 10, 492, 108)
    g.fillStyle = 'rgba(35,20,4,0.9)'
    g.textAlign = 'center'
    g.font = '600 44px "Geist Mono Variable", monospace'
    g.fillText(text, 256, 66)
    g.font = '500 18px "Geist Mono Variable", monospace'
    g.fillText(sub, 256, 98)
    return finish(c)
  })

/** Digits 0-9 around a combination dial. */
export const dialNumbers = () =>
  memo('dial', () => {
    const [c, g] = canvas(512, 64)
    g.fillStyle = '#1a1b1e'
    g.fillRect(0, 0, 512, 64)
    g.fillStyle = '#d8d2c4'
    g.font = '600 36px "Geist Mono Variable", monospace'
    g.textAlign = 'center'
    for (let i = 0; i < 10; i++) g.fillText(String(i), (i + 0.5) * 51.2, 45)
    return finish(c)
  })

/** Top bill of a banded stack of cash. */
export const banknote = () =>
  memo('note', () => {
    const [c, g] = canvas(512, 220)
    g.fillStyle = '#b9c4a6'
    g.fillRect(0, 0, 512, 220)
    g.strokeStyle = '#3d5a3a'
    g.lineWidth = 6
    g.strokeRect(12, 12, 488, 196)
    g.lineWidth = 1
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(61,90,58,${0.15 + Math.random() * 0.2})`
      g.beginPath()
      g.ellipse(256, 110, 40 + i * 3, 30 + i * 1.4, 0, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = '#9fae8b'
    g.beginPath()
    g.ellipse(256, 110, 46, 58, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2f4a2d'
    g.font = '700 54px "Instrument Serif", serif'
    g.fillText('100', 36, 72)
    g.fillText('100', 400, 190)
    // paper band
    g.fillStyle = '#d8c79a'
    g.fillRect(226, 0, 60, 220)
    g.fillStyle = '#6b5a2e'
    g.font = '600 16px "Geist Mono Variable", monospace'
    g.save()
    g.translate(262, 110)
    g.rotate(-Math.PI / 2)
    g.textAlign = 'center'
    g.fillText('$10,000', 0, 0)
    g.restore()
    return finish(c)
  })

/** Vault floor plan for the blueprint sheet. */
export const blueprint = () =>
  memo('blueprint', () => {
    const [c, g] = canvas(1400, 960)
    g.fillStyle = '#0f3563'
    g.fillRect(0, 0, 1400, 960)
    g.strokeStyle = 'rgba(255,255,255,0.06)'
    g.lineWidth = 1
    for (let x = 0; x < 1400; x += 28) g.strokeRect(x, 0, 0, 960)
    for (let y = 0; y < 960; y += 28) g.strokeRect(0, y, 1400, 0)
    g.strokeStyle = 'rgba(225,238,255,0.9)'
    g.lineWidth = 6
    g.strokeRect(100, 120, 1200, 720)
    g.lineWidth = 4
    g.strokeRect(100, 120, 380, 300)
    g.strokeRect(480, 120, 360, 220)
    g.strokeRect(880, 480, 420, 360)
    g.beginPath()
    g.arc(1090, 660, 110, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(1090, 660, 70, 0, Math.PI * 2)
    g.stroke()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(1090 + Math.cos(a) * 70, 660 + Math.sin(a) * 70)
      g.lineTo(1090 + Math.cos(a) * 110, 660 + Math.sin(a) * 110)
      g.stroke()
    }
    g.setLineDash([18, 12])
    g.strokeStyle = '#ff5b5b'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(290, 420)
    g.lineTo(290, 640)
    g.lineTo(760, 640)
    g.lineTo(760, 560)
    g.lineTo(960, 560)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#ff5b5b'
    g.beginPath()
    g.arc(290, 420, 12, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(225,238,255,0.95)'
    g.font = 'italic 64px "Instrument Serif", serif'
    g.fillText('First National Reserve', 100, 90)
    g.font = '500 24px "Geist Mono Variable", monospace'
    g.fillText('LEVEL B2  ·  SCALE 1:50  ·  SHEET 04/07', 820, 90)
    g.fillText('ENTRY', 250, 280)
    g.fillText('SECURITY', 590, 240)
    g.fillText('VAULT', 1050, 800)
    g.fillStyle = 'rgba(255,91,91,0.95)'
    g.fillText('ROUTE A  03:12', 540, 690)
    return finish(c)
  })
