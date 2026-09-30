/**
 * ID card templates. A template says where the photo and each text field go,
 * and how to paint the card behind them. To use a scanned/designed card image
 * instead of the code-drawn one, set `background` to its URL (e.g. put
 * `my-card.png` in /public and use '/my-card.png') and adjust the boxes.
 */

export type CardData = {
  name: string
  codename: string
  role: string
  crewNo: string
  issued: string
}

export type TextField = {
  key: keyof CardData
  /** small caption drawn above the value */
  label?: string
  x: number
  y: number
  maxWidth: number
  font: string
  color: string
  labelColor?: string
  uppercase?: boolean
}

export type Box = { x: number; y: number; w: number; h: number; radius?: number }

export type CardTemplate = {
  width: number
  height: number
  /** image URL painted edge to edge; when set, drawBackground is skipped */
  background?: string
  drawBackground?: (g: CanvasRenderingContext2D, t: CardTemplate) => void
  photo: Box
  fields: TextField[]
  /** painted last, over photo and text (watermarks, stamps, barcode) */
  drawOverlay?: (g: CanvasRenderingContext2D, t: CardTemplate, data: CardData) => void
}

// UTSA-ish palette: navy and orange
const NAVY = '#0c2340'
const NAVY_2 = '#15345c'
const ORANGE = '#f15a22'
const CREAM = '#f6efe4'

/** Original novelty design in school colors. Not a copy of any real ID. */
export const ROWDY_CREW: CardTemplate = {
  width: 1012,
  height: 638, // CR80 card ratio
  photo: { x: 48, y: 150, w: 270, h: 340, radius: 14 },
  fields: [
    { key: 'name', label: 'NAME', x: 360, y: 205, maxWidth: 600, font: '700 46px system-ui, sans-serif', color: CREAM, labelColor: ORANGE, uppercase: true },
    { key: 'codename', label: 'CODENAME', x: 360, y: 290, maxWidth: 600, font: 'italic 600 36px Georgia, serif', color: CREAM, labelColor: ORANGE },
    { key: 'role', label: 'ROLE', x: 360, y: 365, maxWidth: 380, font: '600 28px system-ui, sans-serif', color: CREAM, labelColor: ORANGE, uppercase: true },
    { key: 'crewNo', label: 'CREW NO.', x: 360, y: 440, maxWidth: 260, font: '600 28px ui-monospace, Menlo, monospace', color: CREAM, labelColor: ORANGE },
    { key: 'issued', label: 'ISSUED', x: 640, y: 440, maxWidth: 300, font: '600 28px ui-monospace, Menlo, monospace', color: CREAM, labelColor: ORANGE },
  ],
  drawBackground(g, t) {
    const { width: w, height: h } = t
    g.fillStyle = NAVY
    g.fillRect(0, 0, w, h)

    // guilloche-style wavy lines
    g.save()
    g.globalAlpha = 0.35
    g.strokeStyle = NAVY_2
    g.lineWidth = 1.5
    for (let k = 0; k < 26; k++) {
      g.beginPath()
      for (let x = 0; x <= w; x += 6) {
        const y = 110 + k * 20 + Math.sin(x / 38 + k * 0.7) * 12 + Math.sin(x / 110 + k) * 8
        if (x === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.restore()

    // header band
    g.fillStyle = ORANGE
    g.fillRect(0, 0, w, 110)
    g.fillStyle = NAVY
    g.fillRect(0, 110, w, 6)

    drawMask(g, 62, 55, 1)
    g.fillStyle = CREAM
    g.font = '800 44px system-ui, sans-serif'
    g.textBaseline = 'alphabetic'
    g.fillText('ROWDY HEIST CREW', 140, 62)
    g.fillStyle = NAVY
    g.font = '600 20px system-ui, sans-serif'
    g.fillText('UTSA-THEMED NOVELTY  ·  ROADRUNNER DIVISION', 142, 92)

    // footer strip
    g.fillStyle = ORANGE
    g.fillRect(0, h - 44, w, 44)
    g.fillStyle = NAVY
    g.font = '700 17px system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText('NOVELTY ITEM · NOT A VALID UNIVERSITY OR GOVERNMENT ID · FOR HACKATHON USE ONLY', w / 2, h - 16)
    g.textAlign = 'left'
  },
  drawOverlay(g, t, data) {
    drawBarcode(g, 640, 488, 320, 56, data.crewNo + data.name)

    // "clearance" stamp
    g.save()
    g.translate(880, 300)
    g.rotate(-0.22)
    g.strokeStyle = ORANGE
    g.fillStyle = ORANGE
    g.lineWidth = 4
    g.globalAlpha = 0.85
    roundRect(g, -90, -34, 180, 68, 8)
    g.stroke()
    g.font = '800 26px system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText('VAULT', 0, -2)
    g.font = '700 16px system-ui, sans-serif'
    g.fillText('ACCESS: ALL', 0, 22)
    g.restore()

    // big diagonal NOVELTY watermark across the whole card
    g.save()
    g.translate(t.width / 2, t.height / 2 + 20)
    g.rotate(-0.32)
    g.font = '900 150px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = 'rgba(255,255,255,0.09)'
    g.fillText('NOVELTY', 0, 0)
    g.strokeStyle = 'rgba(241,90,34,0.35)'
    g.lineWidth = 2
    g.strokeText('NOVELTY', 0, 0)
    g.restore()
  },
}

export const TEMPLATES = { rowdy: ROWDY_CREW }
export const DEFAULT_TEMPLATE = ROWDY_CREW

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Little domino mask logo. */
function drawMask(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.save()
  g.translate(cx, cy)
  g.scale(s, s)
  g.fillStyle = NAVY
  g.beginPath()
  g.moveTo(-44, -8)
  g.quadraticCurveTo(-40, -26, -10, -18)
  g.quadraticCurveTo(0, -12, 10, -18)
  g.quadraticCurveTo(40, -26, 44, -8)
  g.quadraticCurveTo(46, 18, 16, 18)
  g.quadraticCurveTo(4, 18, 0, 8)
  g.quadraticCurveTo(-4, 18, -16, 18)
  g.quadraticCurveTo(-46, 18, -44, -8)
  g.fill()
  g.fillStyle = ORANGE
  g.beginPath()
  g.ellipse(-20, 0, 11, 7, 0.15, 0, Math.PI * 2)
  g.ellipse(20, 0, 11, 7, -0.15, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

/** Decorative barcode derived from a string. Encodes nothing real. */
function drawBarcode(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: string) {
  let s = 0
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0
  g.fillStyle = CREAM
  g.fillRect(x - 8, y - 6, w + 16, h + 12)
  g.fillStyle = NAVY
  let cx = x
  while (cx < x + w) {
    s = (s * 1103515245 + 12345) >>> 0
    const bar = 1 + ((s >> 8) % 4)
    const gap = 1 + ((s >> 12) % 3)
    g.fillRect(cx, y, Math.min(bar * 2, x + w - cx), h)
    cx += (bar + gap) * 2
  }
}
