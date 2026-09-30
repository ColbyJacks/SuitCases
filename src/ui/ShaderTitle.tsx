import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main() {
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`

// Polished-gold text: soft noise-driven metal bands, a bevel, a travelling
// specular sweep, a cursor light with a faint ripple and a noisy left-to-right reveal.
const FRAG = `
precision highp float;
uniform sampler2D uMask;
uniform float uTime;
uniform float uReveal;
uniform vec2 uMouse;
uniform vec2 uRes;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 q = vec2(uv.x * aspect, uv.y);
  vec2 m = vec2(uMouse.x * aspect, uMouse.y);
  float d = distance(q, m);

  // gentle drift only, so the letter edges stay crisp
  vec2 flow = vec2(fbm(q * 2.0 + uTime * 0.08), fbm(q * 2.0 - uTime * 0.08 + 7.0)) - 0.5;
  vec2 ripple = (q - m) / max(d, 1e-3) * sin(d * 38.0 - uTime * 5.0) * exp(-d * 6.0) * 0.0015;
  vec2 suv = uv + flow * 0.0012 + vec2(ripple.x / aspect, ripple.y);

  float mask = texture2D(uMask, suv).r;
  // bevel: light catches the top edge of each stroke, the bottom edge falls into shade
  float px = 1.5 / uRes.y;
  float bevel = texture2D(uMask, suv - vec2(0.0, px)).r - texture2D(uMask, suv + vec2(0.0, px)).r;

  // polished gold that never drops below mid-tone, so every letter stays readable
  float n = fbm(q * vec2(1.2, 3.0) + vec2(uTime * 0.05, 0.0));
  float bands = sin((uv.y * 2.0 + n * 2.2 + uTime * 0.12) * 6.2831);
  vec3 low = vec3(0.80, 0.58, 0.27);
  vec3 gold = vec3(0.96, 0.78, 0.45);
  vec3 cream = vec3(1.0, 0.95, 0.83);
  vec3 col = mix(low, gold, smoothstep(-1.0, 0.4, bands));
  col = mix(col, cream, smoothstep(0.6, 1.0, bands) * 0.7);
  col *= 0.9 + 0.18 * uv.y;
  col += bevel * 0.16;

  float sweepX = fract(uTime * 0.11) * 2.2 - 0.6;
  float sweep = smoothstep(0.07, 0.0, abs(uv.x - sweepX + (uv.y - 0.5) * 0.35));
  col += vec3(1.0, 0.94, 0.82) * sweep * 0.5;
  col += vec3(1.0, 0.85, 0.6) * exp(-d * 7.0) * 0.35;

  float edge = fbm(q * 5.0) * 0.35;
  float reveal = smoothstep(0.0, 0.08, uReveal * 1.45 - (uv.x * 1.0 + edge));

  float a = mask * reveal;
  vec3 rgb = min(col, vec3(1.0)) * a;
  gl_FragColor = vec4(rgb, a);
}`

type Props = {
  className?: string
}

/**
 * "Operation Suitcase" set in Instrument Serif and painted with a WebGL
 * liquid-metal shader, in the spirit of unicorn.studio hero effects.
 */
export function ShaderTitle({ className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const uTime = u('uTime')
    const uReveal = u('uReveal')
    const uMouse = u('uMouse')
    const uRes = u('uRes')

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    const drawMask = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)

      const mc = document.createElement('canvas')
      mc.width = canvas.width
      mc.height = canvas.height
      const g = mc.getContext('2d')!
      const size = canvas.height * 0.78
      const roman = `400 ${size}px "Instrument Serif", serif`
      const italic = `italic 400 ${size}px "Instrument Serif", serif`
      g.font = roman
      const a = 'Operation '
      const wa = g.measureText(a).width
      g.font = italic
      const b = 'Suitcase'
      const wb = g.measureText(b).width
      let scale = 1
      if (wa + wb > mc.width * 0.96) scale = (mc.width * 0.96) / (wa + wb)
      const draw = () => {
        g.save()
        g.translate(mc.width / 2, mc.height * 0.72)
        g.scale(scale, scale)
        g.textBaseline = 'alphabetic'
        // a thin stroke of the same colour thickens the serif's hairlines so they survive small sizes
        g.lineWidth = size * 0.022
        g.lineJoin = 'round'
        g.font = roman
        g.fillText(a, -(wa + wb) / 2, 0)
        g.strokeText(a, -(wa + wb) / 2, 0)
        g.font = italic
        g.fillText(b, -(wa + wb) / 2 + wa, 0)
        g.strokeText(b, -(wa + wb) / 2 + wa, 0)
        g.restore()
      }
      // R channel: the letters
      g.clearRect(0, 0, mc.width, mc.height)
      g.fillStyle = g.strokeStyle = 'rgb(255,0,0)'
      draw()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mc)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }

    let mouse = [0.5, -2]
    let target = [0.5, -2]
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      target = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]
    }
    window.addEventListener('pointermove', onMove)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let ready = false
    const start = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!ready) return
      const t = (now - start) / 1000
      mouse = [mouse[0] + (target[0] - mouse[0]) * 0.08, mouse[1] + (target[1] - mouse[1]) * 0.08]
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uTime, reduced ? 4 : t)
      gl.uniform1f(uReveal, reduced ? 1 : Math.min(1, Math.max(0, (t - 0.6) / 2.2)))
      gl.uniform2f(uMouse, mouse[0], mouse[1])
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(frame)

    Promise.all([
      document.fonts.load('400 40px "Instrument Serif"'),
      document.fonts.load('italic 400 40px "Instrument Serif"'),
    ]).catch(() => {}).then(() => {
      drawMask()
      ready = true
    })
    const ro = new ResizeObserver(() => ready && drawMask())
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <canvas ref={ref} className={className} role="img" aria-label="Operation Suitcase" />
  )
}
