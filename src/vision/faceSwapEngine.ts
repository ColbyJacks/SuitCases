export type FaceSwapParams = {
  opacity: number
  colorMatch: number
  showMesh: boolean
  mirror: boolean
  hair: boolean
  hairColor: string
  hairStrength: number
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

class FaceSwapEngine {
  readonly canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  
  running = false
  tracking = false
  sourceUrl: string | null = null
  onChange: (() => void) | null = null

  private params: FaceSwapParams = { ...DEFAULT_FACE_PARAMS }
  private video = document.createElement('video')
  private stream: MediaStream | null = null
  private loading: Promise<void> | null = null
  
  private ws: WebSocket | null = null
  private wsReadyToSend = false
  private pendingSource: string | null = null
  private wsSwappedReady = false
  private wsSwappedImg = new Image()
  
  private wsCanvas = document.createElement('canvas')
  private wsCtx = this.wsCanvas.getContext('2d', { willReadFrequently: true })!
  private raf = 0
  private lastTs = -1
  private frame = 0

  async load() {
    if (this.loading) return this.loading
    this.loading = Promise.resolve()
    return this.loading
  }

  setParams(params: Partial<FaceSwapParams>) {
    this.params = { ...this.params, ...params }
    this.onChange?.()
  }

  async start() {
    if (this.running) return
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } 
    })
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play()
    this.canvas.width = this.video.videoWidth
    this.canvas.height = this.video.videoHeight
    
    // Goes through the Vite proxy (/api/faceswap -> backend :8001) so it works over https / Tailscale.
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/api/faceswap/ws`)
    this.ws = ws
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 8000)
        ws.onopen = () => { clearTimeout(timer); resolve() }
        ws.onerror = () => { clearTimeout(timer); reject(new Error('error')) }
      })
    } catch {
      ws.close()
      this.ws = null
      stream.getTracks().forEach((t) => t.stop())
      this.stream = null
      throw new Error("Can't reach the face swap server. Run `npm run faceswap` and wait for \"Models Loaded!\".")
    }
    ws.onclose = () => {
      if (this.running) this.stop()
    }
    this.wsReadyToSend = true
    if (this.pendingSource) ws.send(this.pendingSource)
    this.ws.onmessage = (e) => {
      this.wsSwappedImg.onload = () => { 
        this.wsSwappedReady = true
        this.wsReadyToSend = true 
      }
      this.wsSwappedImg.src = e.data
    }

    this.running = true
    this.loop()
    this.onChange?.()
  }

  stop() {
    this.running = false
    this.tracking = false
    cancelAnimationFrame(this.raf)
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop())
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.stream = null
    this.wsReadyToSend = false
    this.onChange?.()
  }

  async setSource(file: Blob) {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
    const img = document.createElement('canvas')
    img.width = Math.round(bitmap.width * scale)
    img.height = Math.round(bitmap.height * scale)
    img.getContext('2d')!.drawImage(bitmap, 0, 0, img.width, img.height)
    bitmap.close()

    this.pendingSource = "SET_SOURCE:" + img.toDataURL('image/jpeg', 0.9)
    if (this.ws?.readyState === 1) this.ws.send(this.pendingSource)
    this.hasSource = true

    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl)
    this.sourceUrl = URL.createObjectURL(file)
    this.onChange?.()
  }

  clearSource() {
    this.hasSource = false
    this.pendingSource = null
    if (this.sourceUrl) URL.revokeObjectURL(this.sourceUrl)
    this.sourceUrl = null
    this.onChange?.()
  }
  
  hasSource = false
  get hasFace() { return this.hasSource }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    if (this.video.readyState < 2) return
    const ts = performance.now()
    if (ts <= this.lastTs) return
    this.lastTs = ts

    if (this.wsReadyToSend && this.ws?.readyState === 1) {
      this.wsReadyToSend = false
      const outW = 640
      const outH = Math.round(outW * this.video.videoHeight / this.video.videoWidth)
      if (this.wsCanvas.width !== outW) {
        this.wsCanvas.width = outW; this.wsCanvas.height = outH;
      }
      this.wsCtx.drawImage(this.video, 0, 0, outW, outH)
      this.ws.send(this.wsCanvas.toDataURL('image/jpeg', 0.6))
    }

    this.frame++
    this.tracking = true // We are connected
    this.draw()
  }

  private draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    
    // Handle mirroring via canvas transform
    if (this.params.mirror) {
      this.ctx.save()
      this.ctx.translate(this.canvas.width, 0)
      this.ctx.scale(-1, 1)
    }

    if (this.wsSwappedReady && this.hasSource && !this.params.showMesh) {
      this.ctx.drawImage(this.wsSwappedImg, 0, 0, this.canvas.width, this.canvas.height)
    } else {
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    }

    if (this.params.mirror) {
      this.ctx.restore()
    }
  }

  snapshot(): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'))
  }

  get recording() { return false }
  startRecording() {}
  stopRecording(): Promise<Blob | null> { return Promise.resolve(null) }
}

export const faceSwapEngine = new FaceSwapEngine()
