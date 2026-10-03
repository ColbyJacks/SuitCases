import { FaceLandmarker, FilesetResolver, ImageSegmenter, type NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Live face swap, entirely in the browser.
 *
 * MediaPipe Face Landmarker tracks 468 points on your face every frame. The same 468 points are found
 * once on the uploaded photo. We draw your webcam, then draw MediaPipe's face mesh on top of it:
 * vertex positions come from your live landmarks, texture coordinates come from the photo's landmarks,
 * so the photo's face gets warped onto yours triangle by triangle. The outer rings of the mesh fade
 * out for a soft edge, and the photo's skin tone is nudged toward yours so it sits in the lighting.
 *
 * What keeps it from looking pasted on:
 * - Landmarks go through a One Euro filter, so the mask stops shimmering when you hold still but
 *   still keeps up when you move.
 * - Relighting: both faces are blurred (in their own pixel scale, so the blur covers the same part of
 *   the face), and the photo is multiplied by blur(live) / blur(photo). The photo keeps its fine detail
 *   but takes on your camera's colour, shadows and highlights.
 * - The photo is mipmapped and sampled slightly soft, so a sharp, high-res photo doesn't crawl or
 *   look crisper than the webcam around it.
 * - Edges fade over more rings, and the eye and mouth holes are feathered instead of cut out.
 *
 * Hair dye: MediaPipe's hair segmenter finds your hair, the mask is smoothed over time, and the video
 * pass repaints it in the chosen colour while keeping the hair's own light and shadow.
 */

export type FaceSwapParams = {
  opacity: number // 0 – 1, how much of the photo face shows
  colorMatch: number // 0 – 1, relight the photo with your camera's colour and shading
  showMesh: boolean // draw the tracked wireframe instead of the swap
  mirror: boolean
  hair: boolean // recolour your hair
  hairColor: string // #rrggbb
  hairStrength: number // 0 – 1
}

export const DEFAULT_FACE_PARAMS: FaceSwapParams = {
  opacity: 1,
  colorMatch: 0.85,
  showMesh: false,
  mirror: true,
  hair: false,
  hairColor: '#e8dcc0',
  hairStrength: 0.85,
}

export type HairStatus = 'idle' | 'loading' | 'ready' | 'error'

const BASE = import.meta.env.BASE_URL
const WASM_PATH = `${BASE}mediapipe`
const MODEL_PATH = `${BASE}models/face_landmarker.task`
const HAIR_MODEL_PATH = `${BASE}models/hair_segmenter.tflite`
const MESH_POINTS = 468 // the model also returns 10 iris points; the mesh only uses the first 468
const MAX_SOURCE_SIZE = 1024
const BLUR_SCALE = 4 // lighting is measured at 1/4 resolution
const CHEEK_R = 234 // outermost cheek points, used to measure face width
const CHEEK_L = 454

// One Euro filter tuning (normalised image units per second).
const MIN_CUTOFF = 1.0 // Hz when still: lower = smoother
const BETA = 20 // how quickly the cutoff rises with speed: higher = less lag when moving
const D_CUTOFF = 1.0

/** Triangles of the canonical face mesh, recovered from MediaPipe's edge list, plus per-vertex alpha. */
function buildTriangles(): { indices: Uint16Array; alpha: Float32Array } {
  const adj = Array.from({ length: MESH_POINTS }, () => new Set<number>())
  for (const { start, end } of FaceLandmarker.FACE_LANDMARKS_TESSELATION) {
    adj[start].add(end)
    adj[end].add(start)
  }
  const tris: number[] = []
  for (let a = 0; a < MESH_POINTS; a++) {
    for (const b of adj[a]) {
      if (b <= a) continue
      for (const c of adj[b]) {
        if (c <= b || !adj[a].has(c)) continue
        tris.push(a, b, c)
      }
    }
  }

  // Feather: distance (in mesh hops) from a contour sets each vertex's alpha.
  const hops = (conns: { start: number; end: number }[], max: number) => {
    const d = new Array<number>(MESH_POINTS).fill(Infinity)
    let frontier: number[] = []
    for (const { start, end } of conns)
      for (const v of [start, end])
        if (d[v] !== 0) {
          d[v] = 0
          frontier.push(v)
        }
    for (let r = 1; r <= max; r++) {
      const next: number[] = []
      for (const v of frontier)
        for (const n of adj[v])
          if (d[n] === Infinity) {
            d[n] = r
            next.push(n)
          }
      frontier = next
    }
    return d
  }
  const oval = hops(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, 4)
  const eyes = hops([...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE], 2)
  const lips = hops(FaceLandmarker.FACE_LANDMARKS_LIPS, 2)
  const OVAL = [0, 0.3, 0.62, 0.88, 1]
  const EYE = [0.2, 0.75, 1] // your own eyelids blend in around the eye holes
  const LIP = [0.6, 0.9, 1] // a little of your own mouth shows through, so speech looks natural
  const pick = (table: number[], d: number) => (d < table.length ? table[d] : 1)
  const alpha = new Float32Array(MESH_POINTS)
  for (let i = 0; i < MESH_POINTS; i++) alpha[i] = Math.min(pick(OVAL, oval[i]), pick(EYE, eyes[i]), pick(LIP, lips[i]))
  return { indices: new Uint16Array(tris), alpha }
}

/**
 * One Euro filter over all landmarks. Each point's cutoff rises with the faster of its own speed and the
 * whole face's average speed, so head turns move the mesh together and mouth movement stays snappy.
 */
class LandmarkSmoother {
  private x: Float32Array | null = null
  private dx = new Float32Array(MESH_POINTS * 3)
  private speed = new Float32Array(MESH_POINTS)
  private last = 0

  apply(raw: Float32Array, t: number): Float32Array {
    if (!this.x || t - this.last > 300) {
      this.x = raw.slice()
      this.dx.fill(0)
      this.last = t
      return this.x
    }
    const dt = Math.max(1e-3, (t - this.last) / 1000)
    this.last = t
    const alpha = (fc: number) => 1 / (1 + 1 / (2 * Math.PI * fc * dt))
    const ad = alpha(D_CUTOFF)
    const { x, dx, speed } = this
    let global = 0
    for (let i = 0; i < MESH_POINTS; i++) {
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k
        dx[j] += ad * ((raw[j] - x[j]) / dt - dx[j])
      }
      speed[i] = Math.hypot(dx[i * 3], dx[i * 3 + 1])
      global += speed[i]
    }
    global /= MESH_POINTS
    for (let i = 0; i < MESH_POINTS; i++) {
      const a = alpha(MIN_CUTOFF + BETA * Math.max(global, speed[i]))
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k
        x[j] += a * (raw[j] - x[j])
      }
    }
    return x
  }
}

/** Full-screen quad. On screen it flips to image orientation (and mirrors); into a target it keeps texture space. */
const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform float u_mirror;
uniform float u_screen;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  if (u_screen > 0.5) {
    v_uv.y = 1.0 - v_uv.y;
    if (u_mirror > 0.5) v_uv.x = 1.0 - v_uv.x;
  }
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const VIDEO_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform float u_hair;
uniform vec3 u_hairColor;
uniform float u_hairLum;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  if (u_hair > 0.0) {
    float m = smoothstep(0.3, 0.8, texture(u_mask, v_uv).r);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Keep the hair's own light and shadow (relative to its average brightness), painted in the dye colour.
    float shade = clamp(pow(l / max(u_hairLum, 0.03), 0.8), 0.0, 1.7);
    vec3 dyed = clamp(u_hairColor * shade, 0.0, 1.0);
    c = mix(c, dyed, m * u_hair);
  }
  o = vec4(c, 1.0);
}`

const COPY_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`

/** One direction of a 13-tap Gaussian (sigma = 2.5 taps); u_step is the tap spacing in UV units. */
const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_step;
out vec4 o;
void main() {
  vec4 s = vec4(0.0);
  float wsum = 0.0;
  for (int k = -6; k <= 6; k++) {
    float w = exp(-float(k * k) / 12.5);
    s += texture(u_tex, v_uv + u_step * float(k)) * w;
    wsum += w;
  }
  o = s / wsum;
}`

const FACE_VS = `#version 300 es
in vec3 a_pos;
in vec2 a_uv;
in float a_alpha;
uniform float u_mirror;
out vec2 v_uv;
out vec2 v_live;
out float v_alpha;
void main() {
  v_uv = a_uv;
  v_live = a_pos.xy;
  v_alpha = a_alpha;
  float x = a_pos.x * 2.0 - 1.0;
  if (u_mirror > 0.5) x = -x;
  gl_Position = vec4(x, 1.0 - a_pos.y * 2.0, a_pos.z, 1.0);
}`

const FACE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_live;
in float v_alpha;
uniform sampler2D u_tex;
uniform sampler2D u_srcLow;
uniform sampler2D u_liveLow;
uniform float u_colorMatch;
uniform float u_opacity;
uniform float u_wire;
out vec4 o;
void main() {
  if (u_wire > 0.5) { o = vec4(1.0, 0.68, 0.24, 0.55); return; }
  // A small mip bias softens the photo toward webcam sharpness.
  vec3 c = texture(u_tex, v_uv, 0.6).rgb;
  // Swap the photo's lighting for yours: detail stays, low-frequency colour and shading come from the camera.
  vec3 srcLow = texture(u_srcLow, v_uv).rgb;
  vec3 liveLow = texture(u_liveLow, v_live).rgb;
  vec3 ratio = clamp((liveLow + 0.03) / (srcLow + 0.03), 0.3, 2.5);
  c = mix(c, clamp(c * ratio, 0.0, 1.0), u_colorMatch);
  o = vec4(c, v_alpha * u_opacity);
}`

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const prog = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
    gl.attachShader(prog, s)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error')
  return prog
}

type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

/** Face width in pixels of an image `w` × `h`, measured cheek to cheek. */
function faceWidth(points: ArrayLike<number> | NormalizedLandmark[], w: number, h: number) {
  const get = (i: number) =>
    Array.isArray(points)
      ? [(points as NormalizedLandmark[])[i].x, (points as NormalizedLandmark[])[i].y]
      : [(points as ArrayLike<number>)[i * 3], (points as ArrayLike<number>)[i * 3 + 1]]
  const [ax, ay] = get(CHEEK_R)
  const [bx, by] = get(CHEEK_L)
  return Math.hypot((bx - ax) * w, (by - ay) * h)
}

/** Blur radius (in 1/BLUR_SCALE pixels) that covers the same share of any face. */
function lightingSigma(faceWidthPx: number) {
  return Math.min(14, Math.max(1, (faceWidthPx / BLUR_SCALE) * 0.08))
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n)) return [1, 1, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

class FaceSwapEngine {
  readonly canvas = document.createElement('canvas')
  running = false
  /** True while a face is being tracked in the live feed. */
  tracking = false
  sourceUrl: string | null = null
  hairStatus: HairStatus = 'idle'
  hairError: string | null = null
  onChange: (() => void) | null = null

  private params: FaceSwapParams = { ...DEFAULT_FACE_PARAMS }
  private video = document.createElement('video')
  private stream: MediaStream | null = null
  private filesetP: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null
  private videoLm: FaceLandmarker | null = null
  private imageLm: FaceLandmarker | null = null
  private hairSeg: ImageSegmenter | null = null
  private loading: Promise<void> | null = null
  private raf = 0
  private lastTs = -1
  private frame = 0

  private gl: WebGL2RenderingContext | null = null
  private videoProg!: WebGLProgram
  private copyProg!: WebGLProgram
  private blurProg!: WebGLProgram
  private faceProg!: WebGLProgram
  private locs = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  private quadVao!: WebGLVertexArrayObject
  private faceVao!: WebGLVertexArrayObject
  private posBuf!: WebGLBuffer
  private uvBuf!: WebGLBuffer
  private triCount = 0
  private triIdx!: WebGLBuffer
  private edgeIdx!: WebGLBuffer
  private edgeCount = 0
  private videoTex!: WebGLTexture
  private sourceTex!: WebGLTexture
  private hairTex!: WebGLTexture
  private liveLow: Target | null = null
  private liveTmp: Target | null = null
  private srcLow: Target | null = null
  private srcTmp: Target | null = null
  private hasSource = false

  private raw = new Float32Array(MESH_POINTS * 3)
  private positions = new Float32Array(MESH_POINTS * 3)
  private smoother = new LandmarkSmoother()
  private liveSigma = 4

  private hairMask = new Uint8Array(0)
  private hairMaskW = 0
  private hairMaskH = 0
  private hairLum = -1
  private sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []

  constructor() {
    this.video.muted = true
    this.video.playsInline = true
  }

  setParams(p: Partial<FaceSwapParams>) {
    // Turning hair back on after a failed load retries it.
    if (p.hair && !this.params.hair && this.hairStatus === 'error') {
      this.hairStatus = 'idle'
      this.hairError = null
    }
    this.params = { ...this.params, ...p }
  }

  private fileset() {
    this.filesetP ??= FilesetResolver.forVisionTasks(WASM_PATH).catch((e) => {
      this.filesetP = null
      throw e
    })
    return this.filesetP
  }

  /** Loads the tracker (WASM + model, served from this site) the first time it's needed. */
  private load() {
    this.loading ??= (async () => {
      const fileset = await this.fileset()
      const make = (mode: 'VIDEO' | 'IMAGE', delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: mode,
          numFaces: 1,
        })
      const withFallback = (mode: 'VIDEO' | 'IMAGE') => make(mode, 'GPU').catch(() => make(mode, 'CPU'))
      this.videoLm = await withFallback('VIDEO')
      this.imageLm = await withFallback('IMAGE')
    })().catch((e) => {
      this.loading = null
      throw e
    })
    return this.loading
  }

  /** Loads the hair segmenter the first time hair dye is switched on. */
  private loadHair() {
    if (this.hairStatus !== 'idle') return
    this.hairStatus = 'loading'
    this.onChange?.()
    ;(async () => {
      const fileset = await this.fileset()
      const make = (delegate: 'GPU' | 'CPU') =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: HAIR_MODEL_PATH, delegate },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        })
      this.hairSeg = await make('GPU').catch(() => make('CPU'))
      this.hairStatus = 'ready'
    })()
      .catch((err) => {
        this.hairStatus = 'error'
        this.hairError = `Couldn't load the hair tracker: ${err instanceof Error ? err.message : String(err)}`
      })
      .finally(() => this.onChange?.())
  }

  private loc(prog: WebGLProgram, name: string) {
    let m = this.locs.get(prog)
    if (!m) this.locs.set(prog, (m = new Map()))
    if (!m.has(name)) m.set(name, this.gl!.getUniformLocation(prog, name))
    return m.get(name)!
  }

  private makeTarget(w: number, h: number, old: Target | null): Target {
    const gl = this.gl!
    w = Math.max(1, Math.ceil(w))
    h = Math.max(1, Math.ceil(h))
    if (old && old.w === w && old.h === h) return old
    if (old) {
      gl.deleteTexture(old.tex)
      gl.deleteFramebuffer(old.fb)
    }
    const tex = this.makeTexture(false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fb, w, h }
  }

  private makeTexture(mipmapped: boolean) {
    const gl = this.gl!
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  private initGl() {
    if (this.gl) return
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL2 is not available in this browser')
    this.gl = gl
    this.videoProg = compile(gl, QUAD_VS, VIDEO_FS)
    this.copyProg = compile(gl, QUAD_VS, COPY_FS)
    this.blurProg = compile(gl, QUAD_VS, BLUR_FS)
    this.faceProg = compile(gl, FACE_VS, FACE_FS)

    this.quadVao = gl.createVertexArray()!
    gl.bindVertexArray(this.quadVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const { indices, alpha } = buildTriangles()
    this.triCount = indices.length
    this.faceVao = gl.createVertexArray()!
    gl.bindVertexArray(this.faceVao)
    const attr = (name: string, size: number, data: Float32Array, usage: number) => {
      const buf = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, data, usage)
      const loc = gl.getAttribLocation(this.faceProg, name)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      return buf
    }
    this.posBuf = attr('a_pos', 3, this.positions, gl.DYNAMIC_DRAW)
    this.uvBuf = attr('a_uv', 2, new Float32Array(MESH_POINTS * 2), gl.STATIC_DRAW)
    attr('a_alpha', 1, alpha, gl.STATIC_DRAW)
    this.triIdx = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIdx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    const edges = FaceLandmarker.FACE_LANDMARKS_TESSELATION.flatMap((c) => [c.start, c.end])
    this.edgeCount = edges.length
    this.edgeIdx = gl.createBuffer()!
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIdx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges), gl.STATIC_DRAW)

    // Mipmaps let the 1/4-size lighting copy average properly, and stop a high-res photo from shimmering.
    this.videoTex = this.makeTexture(true)
    this.sourceTex = this.makeTexture(true)
    this.hairTex = this.makeTexture(false)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]))
  }

  /** Downsamples `src` into `a`, then blurs it (via `b`) so `a` holds the low-frequency lighting. */
  private blurInto(src: WebGLTexture, a: Target, b: Target, sigma: number) {
    const gl = this.gl!
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(this.quadVao)
    gl.activeTexture(gl.TEXTURE0)

    gl.useProgram(this.copyProg)
    gl.uniform1i(this.loc(this.copyProg, 'u_tex'), 0)
    gl.uniform1f(this.loc(this.copyProg, 'u_screen'), 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb)
    gl.viewport(0, 0, a.w, a.h)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    const step = sigma / 2.5
    gl.useProgram(this.blurProg)
    gl.uniform1i(this.loc(this.blurProg, 'u_tex'), 0)
    gl.uniform1f(this.loc(this.blurProg, 'u_screen'), 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb)
    gl.bindTexture(gl.TEXTURE_2D, a.tex)
    gl.uniform2f(this.loc(this.blurProg, 'u_step'), step / a.w, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb)
    gl.bindTexture(gl.TEXTURE_2D, b.tex)
    gl.uniform2f(this.loc(this.blurProg, 'u_step'), 0, step / a.h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindVertexArray(null)
  }

  async start() {
    if (this.running) return
    this.initGl()
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }),
      this.load(),
    ])
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play()
    this.canvas.width = this.video.videoWidth
    this.canvas.height = this.video.videoHeight
    const lw = this.canvas.width / BLUR_SCALE
    const lh = this.canvas.height / BLUR_SCALE
    this.liveLow = this.makeTarget(lw, lh, this.liveLow)
    this.liveTmp = this.makeTarget(lw, lh, this.liveTmp)
    this.running = true
    this.loop()
    this.onChange?.()
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.stopRecording()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
    this.running = false
    this.tracking = false
    this.onChange?.()
  }

  /** Finds the face in an uploaded photo and uses it as the mask. */
  async setSource(file: Blob) {
    this.initGl()
    await this.load()
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SOURCE_SIZE / Math.max(bitmap.width, bitmap.height))
    const img = document.createElement('canvas')
    img.width = Math.round(bitmap.width * scale)
    img.height = Math.round(bitmap.height * scale)
    img.getContext('2d')!.drawImage(bitmap, 0, 0, img.width, img.height)
    bitmap.close()

    const face = this.imageLm!.detect(img).faceLandmarks[0]
    if (!face) throw new Error('No face found in that photo. Try a clear, front-facing shot.')

    const gl = this.gl!
    const uvs = new Float32Array(MESH_POINTS * 2)
    for (let i = 0; i < MESH_POINTS; i++) {
      uvs[i * 2] = face[i].x
      uvs[i * 2 + 1] = face[i].y
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.generateMipmap(gl.TEXTURE_2D)

    // The photo's own lighting, measured once, at the same face-relative scale as the live feed.
    const sw = img.width / BLUR_SCALE
    const sh = img.height / BLUR_SCALE
    this.srcLow = this.makeTarget(sw, sh, this.srcLow)
    this.srcTmp = this.makeTarget(sw, sh, this.srcTmp)
    this.blurInto(this.sourceTex, this.srcLow, this.srcTmp, lightingSigma(faceWidth(face, img.width, img.height)))
    this.hasSource = true

    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl)
    this.sourceUrl = URL.createObjectURL(file)
    this.onChange?.()
  }

  clearSource() {
    this.hasSource = false
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl)
    this.sourceUrl = null
    this.onChange?.()
  }

  get hasFace() {
    return this.hasSource
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    if (this.video.readyState < 2) return
    const ts = performance.now()
    if (ts <= this.lastTs) return
    this.lastTs = ts
    this.frame++

    const face = this.videoLm!.detectForVideo(this.video, ts).faceLandmarks[0]
    const wasTracking = this.tracking
    this.tracking = !!face
    if (wasTracking !== this.tracking) this.onChange?.()

    if (face) {
      for (let i = 0; i < MESH_POINTS; i++) {
        this.raw[i * 3] = face[i].x
        this.raw[i * 3 + 1] = face[i].y
        this.raw[i * 3 + 2] = face[i].z
      }
      this.positions.set(this.smoother.apply(this.raw, ts))
      this.liveSigma = lightingSigma(faceWidth(this.positions, this.canvas.width, this.canvas.height))
    }

    if (this.params.hair) {
      if (this.hairSeg) {
        // Hair moves slowly next to the face, so every other frame is plenty.
        if (this.frame % 2 === 0) this.segmentHair(ts)
        if (this.frame % 8 === 0) this.measureHair()
      } else this.loadHair()
    }

    this.draw(!!face)
  }

  private segmentHair(ts: number) {
    this.hairSeg!.segmentForVideo(this.video, ts, (res) => {
      const masks = res.confidenceMasks
      if (!masks?.length) return
      const m = masks[masks.length > 1 ? 1 : 0] // [background, hair]
      const data = m.getAsFloat32Array()
      const n = m.width * m.height
      const fresh = this.hairMask.length !== n
      if (fresh) {
        this.hairMask = new Uint8Array(n)
        this.hairMaskW = m.width
        this.hairMaskH = m.height
      }
      // Blend with the last mask so the edge doesn't flicker frame to frame.
      const keep = fresh ? 0 : 0.4
      for (let i = 0; i < n; i++) this.hairMask[i] = this.hairMask[i] * keep + data[i] * 255 * (1 - keep)

      const gl = this.gl!
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.hairTex)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.hairMaskW, this.hairMaskH, 0, gl.RED, gl.UNSIGNED_BYTE, this.hairMask)
    })
  }

  /** Average brightness of your hair, so the dye can keep its highlights and shadows relative to it. */
  private measureHair() {
    if (!this.hairMaskW) return
    const SW = 96
    const SH = Math.max(1, Math.round((SW * this.video.videoHeight) / this.video.videoWidth))
    this.sampler.canvas.width = SW
    this.sampler.canvas.height = SH
    this.sampler.drawImage(this.video, 0, 0, SW, SH)
    const px = this.sampler.getImageData(0, 0, SW, SH).data
    let sum = 0
    let wsum = 0
    for (let y = 0; y < SH; y++) {
      const my = Math.floor((y / SH) * this.hairMaskH) * this.hairMaskW
      for (let x = 0; x < SW; x++) {
        const w = this.hairMask[my + Math.floor((x / SW) * this.hairMaskW)] / 255
        if (w < 0.6) continue
        const i = (y * SW + x) * 4
        sum += ((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255) * w
        wsum += w
      }
    }
    if (wsum < 8) return
    const lum = sum / wsum
    this.hairLum = this.hairLum < 0 ? lum : this.hairLum * 0.7 + lum * 0.3
  }

  private draw(face: boolean) {
    const gl = this.gl!
    const { mirror, opacity, colorMatch, showMesh, hair, hairColor, hairStrength } = this.params

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video)
    gl.generateMipmap(gl.TEXTURE_2D)

    const swap = face && this.hasSource && !showMesh
    if (swap && this.liveLow && this.liveTmp) this.blurInto(this.videoTex, this.liveLow, this.liveTmp, this.liveSigma)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)

    const vp = this.videoProg
    gl.useProgram(vp)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.hairTex)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.uniform1i(this.loc(vp, 'u_tex'), 0)
    gl.uniform1i(this.loc(vp, 'u_mask'), 1)
    gl.uniform1f(this.loc(vp, 'u_screen'), 1)
    gl.uniform1f(this.loc(vp, 'u_mirror'), mirror ? 1 : 0)
    const dye = hair && this.hairStatus === 'ready' && this.hairMaskW > 0 && this.hairLum > 0
    gl.uniform1f(this.loc(vp, 'u_hair'), dye ? hairStrength : 0)
    gl.uniform3f(this.loc(vp, 'u_hairColor'), ...hexToRgb(hairColor))
    gl.uniform1f(this.loc(vp, 'u_hairLum'), Math.max(this.hairLum, 0.03))
    gl.bindVertexArray(this.quadVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    if (!face || (!this.hasSource && !showMesh)) return

    const fp = this.faceProg
    gl.useProgram(fp)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.srcLow?.tex ?? null)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.liveLow?.tex ?? null)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.loc(fp, 'u_tex'), 0)
    gl.uniform1i(this.loc(fp, 'u_srcLow'), 1)
    gl.uniform1i(this.loc(fp, 'u_liveLow'), 2)
    gl.uniform1f(this.loc(fp, 'u_mirror'), mirror ? 1 : 0)
    gl.uniform1f(this.loc(fp, 'u_opacity'), opacity)
    gl.uniform1f(this.loc(fp, 'u_colorMatch'), swap && this.srcLow && this.liveLow ? colorMatch : 0)
    gl.bindVertexArray(this.faceVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    if (showMesh) {
      gl.uniform1f(this.loc(fp, 'u_wire'), 1)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIdx)
      gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_SHORT, 0)
    } else {
      // Depth keeps the far cheek behind the nose when you turn your head.
      gl.uniform1f(this.loc(fp, 'u_wire'), 0)
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LESS)
      gl.clear(gl.DEPTH_BUFFER_BIT)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIdx)
      gl.drawElements(gl.TRIANGLES, this.triCount, gl.UNSIGNED_SHORT, 0)
    }
    gl.bindVertexArray(null)
  }

  snapshot(): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'))
  }

  get recording() {
    return this.recorder?.state === 'recording'
  }

  startRecording() {
    if (!this.running || this.recording) return
    this.chunks = []
    this.recorder = new MediaRecorder(this.canvas.captureStream(30))
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.recorder.start()
  }

  stopRecording(): Promise<Blob | null> {
    const rec = this.recorder
    if (!rec || rec.state !== 'recording') return Promise.resolve(null)
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || 'video/webm' }))
      rec.stop()
    })
  }
}

export const faceSwapEngine = new FaceSwapEngine()
