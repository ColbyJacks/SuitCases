import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Live face swap, entirely in the browser.
 *
 * MediaPipe Face Landmarker tracks 468 points on your face every frame. The same 468 points are found
 * once on the uploaded photo. We draw your webcam, then draw MediaPipe's face mesh on top of it:
 * vertex positions come from your live landmarks, texture coordinates come from the photo's landmarks,
 * so the photo's face gets warped onto yours triangle by triangle. The outer rings of the mesh fade
 * out for a soft edge, and the photo's skin tone is nudged toward yours so it sits in the lighting.
 */

export type FaceSwapParams = {
  opacity: number // 0 – 1, how much of the photo face shows
  colorMatch: number // 0 – 1, pull the photo's skin tone toward your camera's lighting
  showMesh: boolean // draw the tracked wireframe instead of the swap
  mirror: boolean
}

export const DEFAULT_FACE_PARAMS: FaceSwapParams = { opacity: 1, colorMatch: 0.8, showMesh: false, mirror: true }

const BASE = import.meta.env.BASE_URL
const WASM_PATH = `${BASE}mediapipe`
const MODEL_PATH = `${BASE}models/face_landmarker.task`
const MESH_POINTS = 468 // the model also returns 10 iris points; the mesh only uses the first 468
const MAX_SOURCE_SIZE = 1024

/** Triangles of the canonical face mesh, recovered from MediaPipe's edge list. */
function buildTriangles(): { indices: Uint16Array; alpha: Float32Array; interior: number[] } {
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

  // Feather: distance (in mesh hops) from the face outline sets each vertex's alpha.
  const ring = new Array<number>(MESH_POINTS).fill(Infinity)
  let frontier: number[] = []
  for (const { start } of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
    ring[start] = 0
    frontier.push(start)
  }
  for (let r = 1; r <= 3; r++) {
    const next: number[] = []
    for (const v of frontier)
      for (const n of adj[v])
        if (ring[n] === Infinity) {
          ring[n] = r
          next.push(n)
        }
    frontier = next
  }
  const FEATHER = [0, 0.45, 0.85, 1]
  const alpha = new Float32Array(MESH_POINTS)
  const interior: number[] = []
  for (let i = 0; i < MESH_POINTS; i++) {
    alpha[i] = ring[i] < FEATHER.length ? FEATHER[ring[i]] : 1
    if (ring[i] >= 3) interior.push(i)
  }
  return { indices: new Uint16Array(tris), alpha, interior }
}

const VIDEO_VS = `#version 300 es
in vec2 a_pos;
uniform float u_mirror;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  if (u_mirror > 0.5) v_uv.x = 1.0 - v_uv.x;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const VIDEO_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`

const FACE_VS = `#version 300 es
in vec3 a_pos;
in vec2 a_uv;
in float a_alpha;
uniform float u_mirror;
out vec2 v_uv;
out float v_alpha;
void main() {
  v_uv = a_uv;
  v_alpha = a_alpha;
  float x = a_pos.x * 2.0 - 1.0;
  if (u_mirror > 0.5) x = -x;
  gl_Position = vec4(x, 1.0 - a_pos.y * 2.0, a_pos.z, 1.0);
}`

const FACE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_alpha;
uniform sampler2D u_tex;
uniform vec3 u_gain;
uniform float u_colorMatch;
uniform float u_opacity;
uniform float u_wire;
out vec4 o;
void main() {
  if (u_wire > 0.5) { o = vec4(1.0, 0.68, 0.24, 0.55); return; }
  vec3 c = texture(u_tex, v_uv).rgb;
  c = mix(c, clamp(c * u_gain, 0.0, 1.0), u_colorMatch);
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

/** Average colour of an image sampled at interior face landmarks. */
function meanFaceColor(
  sampler: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  points: NormalizedLandmark[],
  interior: number[],
): [number, number, number] | null {
  const SW = 160
  const SH = Math.max(1, Math.round((SW * h) / w))
  sampler.canvas.width = SW
  sampler.canvas.height = SH
  sampler.drawImage(img, 0, 0, SW, SH)
  const data = sampler.getImageData(0, 0, SW, SH).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let k = 0; k < interior.length; k += 2) {
    const p = points[interior[k]]
    const x = Math.round(p.x * (SW - 1))
    const y = Math.round(p.y * (SH - 1))
    if (x < 0 || y < 0 || x >= SW || y >= SH) continue
    const i = (y * SW + x) * 4
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    n++
  }
  return n ? [r / n + 1, g / n + 1, b / n + 1] : null
}

class FaceSwapEngine {
  readonly canvas = document.createElement('canvas')
  running = false
  /** True while a face is being tracked in the live feed. */
  tracking = false
  sourceUrl: string | null = null
  onChange: (() => void) | null = null

  private params: FaceSwapParams = { ...DEFAULT_FACE_PARAMS }
  private video = document.createElement('video')
  private stream: MediaStream | null = null
  private videoLm: FaceLandmarker | null = null
  private imageLm: FaceLandmarker | null = null
  private loading: Promise<void> | null = null
  private raf = 0
  private lastTs = -1
  private frame = 0

  private gl: WebGL2RenderingContext | null = null
  private videoProg!: WebGLProgram
  private faceProg!: WebGLProgram
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
  private hasSource = false
  private positions = new Float32Array(MESH_POINTS * 3)
  private interior: number[] = []
  private sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  private sourceMean: [number, number, number] = [128, 128, 128]
  private liveMean: [number, number, number] = [128, 128, 128]
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []

  constructor() {
    this.video.muted = true
    this.video.playsInline = true
  }

  setParams(p: Partial<FaceSwapParams>) {
    this.params = { ...this.params, ...p }
  }

  /** Loads the tracker (WASM + model, served from this site) the first time it's needed. */
  private load() {
    this.loading ??= (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
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

  private initGl() {
    if (this.gl) return
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL2 is not available in this browser')
    this.gl = gl
    this.videoProg = compile(gl, VIDEO_VS, VIDEO_FS)
    this.faceProg = compile(gl, FACE_VS, FACE_FS)

    this.quadVao = gl.createVertexArray()!
    gl.bindVertexArray(this.quadVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const qp = gl.getAttribLocation(this.videoProg, 'a_pos')
    gl.enableVertexAttribArray(qp)
    gl.vertexAttribPointer(qp, 2, gl.FLOAT, false, 0, 0)

    const { indices, alpha, interior } = buildTriangles()
    this.interior = interior
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

    const tex = () => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    this.videoTex = tex()
    this.sourceTex = tex()
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
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    this.sourceMean = meanFaceColor(this.sampler, img, img.width, img.height, face, this.interior) ?? this.sourceMean
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

    const face = this.videoLm!.detectForVideo(this.video, ts).faceLandmarks[0]
    const wasTracking = this.tracking
    this.tracking = !!face
    if (wasTracking !== this.tracking) this.onChange?.()

    if (face) {
      for (let i = 0; i < MESH_POINTS; i++) {
        this.positions[i * 3] = face[i].x
        this.positions[i * 3 + 1] = face[i].y
        this.positions[i * 3 + 2] = face[i].z
      }
      // The live skin tone changes slowly, so re-measure it a few times a second.
      if (this.frame++ % 10 === 0) {
        const m = meanFaceColor(this.sampler, this.video, this.video.videoWidth, this.video.videoHeight, face, this.interior)
        if (m) this.liveMean = m
      }
    }
    this.draw(!!face)
  }

  private draw(face: boolean) {
    const gl = this.gl!
    const { mirror, opacity, colorMatch, showMesh } = this.params
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)

    gl.useProgram(this.videoProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video)
    gl.uniform1i(gl.getUniformLocation(this.videoProg, 'u_tex'), 0)
    gl.uniform1f(gl.getUniformLocation(this.videoProg, 'u_mirror'), mirror ? 1 : 0)
    gl.bindVertexArray(this.quadVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    if (!face || (!this.hasSource && !showMesh)) return

    gl.useProgram(this.faceProg)
    const u = (n: string) => gl.getUniformLocation(this.faceProg, n)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex)
    gl.uniform1i(u('u_tex'), 0)
    gl.uniform1f(u('u_mirror'), mirror ? 1 : 0)
    gl.uniform1f(u('u_opacity'), opacity)
    gl.uniform1f(u('u_colorMatch'), colorMatch)
    // Clamped so a stray highlight or a coloured light can't paint the face an odd colour.
    const gain = (i: number) => Math.min(1.5, Math.max(0.65, this.liveMean[i] / this.sourceMean[i]))
    gl.uniform3f(u('u_gain'), gain(0), gain(1), gain(2))
    gl.bindVertexArray(this.faceVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    if (showMesh) {
      gl.uniform1f(u('u_wire'), 1)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIdx)
      gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_SHORT, 0)
    } else {
      // Depth keeps the far cheek behind the nose when you turn your head.
      gl.uniform1f(u('u_wire'), 0)
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
