import { roundRect, type CardData, type CardTemplate } from './template'

const images = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string) {
  let p = images.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Could not load ${src}`))
      img.src = src
    })
    images.set(src, p)
  }
  return p
}

/** Paint a full card onto `canvas`. `photo` is drawn cover-fit into the photo box. */
export async function renderCard(
  canvas: HTMLCanvasElement,
  t: CardTemplate,
  data: CardData,
  photo: CanvasImageSource | null,
) {
  const bg = t.background ? await loadImage(t.background) : null
  canvas.width = t.width
  canvas.height = t.height
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, t.width, t.height)

  if (bg) g.drawImage(bg, 0, 0, t.width, t.height)
  else t.drawBackground?.(g, t)

  const { x, y, w, h, radius = 0 } = t.photo
  g.save()
  roundRect(g, x, y, w, h, radius)
  g.clip()
  if (photo) {
    const [sw, sh] = sourceSize(photo)
    const scale = Math.max(w / sw, h / sh)
    const dw = sw * scale
    const dh = sh * scale
    g.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  } else {
    g.fillStyle = 'rgba(0,0,0,0.35)'
    g.fillRect(x, y, w, h)
    g.fillStyle = 'rgba(255,255,255,0.5)'
    g.font = '600 22px system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText('PHOTO', x + w / 2, y + h / 2)
    g.textAlign = 'left'
  }
  g.restore()
  g.save()
  roundRect(g, x, y, w, h, radius)
  g.lineWidth = 5
  g.strokeStyle = '#f15a22'
  g.stroke()
  g.restore()

  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  for (const f of t.fields) {
    const raw = data[f.key] || '—'
    const value = f.uppercase ? raw.toUpperCase() : raw
    if (f.label) {
      g.font = '700 15px system-ui, sans-serif'
      g.fillStyle = f.labelColor ?? f.color
      g.fillText(f.label, f.x, f.y - lineHeight(f.font) - 4)
    }
    g.font = f.font
    g.fillStyle = f.color
    fitText(g, value, f.x, f.y, f.maxWidth)
  }

  t.drawOverlay?.(g, t, data)
}

function sourceSize(src: CanvasImageSource): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight]
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight]
  const s = src as { width: number; height: number }
  return [s.width, s.height]
}

function lineHeight(font: string) {
  const m = font.match(/(\d+)px/)
  return m ? Number(m[1]) : 20
}

/** Shrinks horizontally when a value is too long, like a real printer would. */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const width = g.measureText(text).width
  if (width <= maxWidth) {
    g.fillText(text, x, y)
    return
  }
  g.save()
  g.translate(x, y)
  g.scale(maxWidth / width, 1)
  g.fillText(text, 0, 0)
  g.restore()
}
