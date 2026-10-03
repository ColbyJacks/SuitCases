export type VoiceParams = {
  pitch: number // 0.5 – 2, playback-rate style ratio
  robot: number // 0 – 1, ring modulator mix
  radio: number // 0 – 1, band-limit toward a walkie-talkie
  drive: number // 0 – 1, distortion
  echo: number // 0 – 1, echo mix + feedback
  volume: number // 0 – 1.5
}

export const DEFAULT_PARAMS: VoiceParams = {
  pitch: 1,
  robot: 0,
  radio: 0,
  drive: 0,
  echo: 0,
  volume: 1,
}

export const PRESETS: { name: string; params: VoiceParams }[] = [
  { name: 'Natural', params: { ...DEFAULT_PARAMS } },
  { name: 'Deep Boss', params: { ...DEFAULT_PARAMS, pitch: 0.7, echo: 0.1, volume: 1.2 } },
  { name: 'Chipmunk', params: { ...DEFAULT_PARAMS, pitch: 1.7 } },
  { name: 'Robot', params: { ...DEFAULT_PARAMS, pitch: 0.9, robot: 1, drive: 0.15 } },
  { name: 'Radio', params: { ...DEFAULT_PARAMS, radio: 1, drive: 0.35 } },
  { name: 'Phantom', params: { ...DEFAULT_PARAMS, pitch: 0.8, robot: 0.2, echo: 0.55 } },
]

const RING_FREQ = 50

function driveCurve(amount: number): Float32Array<ArrayBuffer> | null {
  if (amount <= 0.001) return null
  const k = 1 + amount * 30
  const n = 2048
  const curve = new Float32Array(n)
  const norm = Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / norm
  }
  return curve
}

type Graph = {
  ctx: AudioContext
  stream: MediaStream
  pitch: AudioWorkletNode
  dry: GainNode
  ringOut: GainNode
  shaper: WaveShaperNode
  highpass: BiquadFilterNode
  lowpass: BiquadFilterNode
  delay: DelayNode
  feedback: GainNode
  echoWet: GainNode
  master: GainNode
  analyser: AnalyserNode
  monitor: GainNode
  recordDest: MediaStreamAudioDestinationNode
  rawDest: MediaStreamAudioDestinationNode
}

/**
 * Live microphone voice changer built on the Web Audio API.
 *
 * mic → pitch shift → (dry | ring mod) → drive → band filters → echo → master
 *   master → analyser → monitor → speakers
 *   master → recorder stream
 *   mic → raw recorder stream (input for the RVC voice clone)
 */
class VoiceEngine {
  private graph: Graph | null = null
  private params: VoiceParams = { ...DEFAULT_PARAMS }
  private monitorOn = true
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private levelBuf = new Float32Array(1024)

  get running() {
    return this.graph !== null
  }

  async start() {
    if (this.graph) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/pitch-shifter.js`)

    const mic = ctx.createMediaStreamSource(stream)
    const pitch = new AudioWorkletNode(ctx, 'pitch-shifter')

    const dry = ctx.createGain()
    const ring = ctx.createGain()
    ring.gain.value = 0
    const osc = ctx.createOscillator()
    osc.frequency.value = RING_FREQ
    osc.connect(ring.gain)
    osc.start()
    const ringOut = ctx.createGain()

    const mix = ctx.createGain()
    const shaper = ctx.createWaveShaper()
    shaper.oversample = '4x'
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'

    const echoIn = ctx.createGain()
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.28
    const feedback = ctx.createGain()
    const echoWet = ctx.createGain()

    const master = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    const monitor = ctx.createGain()
    const recordDest = ctx.createMediaStreamDestination()
    const rawDest = ctx.createMediaStreamDestination()

    mic.connect(pitch)
    mic.connect(rawDest)
    pitch.connect(dry).connect(mix)
    pitch.connect(ring).connect(ringOut).connect(mix)
    mix.connect(shaper).connect(highpass).connect(lowpass).connect(echoIn)
    echoIn.connect(master)
    echoIn.connect(delay)
    delay.connect(feedback).connect(delay)
    delay.connect(echoWet).connect(master)
    master.connect(analyser).connect(monitor).connect(ctx.destination)
    master.connect(recordDest)

    this.graph = {
      ctx, stream, pitch, dry, ringOut, shaper, highpass, lowpass,
      delay, feedback, echoWet, master, analyser, monitor, recordDest, rawDest,
    }
    this.apply()
  }

  async stop() {
    if (!this.graph) return
    this.recorder?.stop()
    this.graph.stream.getTracks().forEach((t) => t.stop())
    await this.graph.ctx.close()
    this.graph = null
  }

  setParams(params: VoiceParams) {
    this.params = params
    this.apply()
  }

  setMonitor(on: boolean) {
    this.monitorOn = on
    this.apply()
  }

  get analyser() {
    return this.graph?.analyser ?? null
  }

  /** RMS level of the processed voice, roughly 0 – 1. */
  getLevel() {
    const a = this.graph?.analyser
    if (!a) return 0
    a.getFloatTimeDomainData(this.levelBuf)
    let sum = 0
    for (const v of this.levelBuf) sum += v * v
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4)
  }

  /** Records the disguised output, or with raw: true the untouched mic (what RVC wants). */
  startRecording({ raw = false } = {}) {
    if (!this.graph || this.recorder) return
    this.chunks = []
    this.recorder = new MediaRecorder((raw ? this.graph.rawDest : this.graph.recordDest).stream)
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.recorder.start()
  }

  stopRecording(): Promise<Blob | null> {
    const rec = this.recorder
    if (!rec) return Promise.resolve(null)
    return new Promise((resolve) => {
      rec.onstop = () => {
        this.recorder = null
        resolve(new Blob(this.chunks, { type: rec.mimeType }))
      }
      rec.stop()
    })
  }

  private apply() {
    const g = this.graph
    if (!g) return
    const p = this.params
    const t = g.ctx.currentTime
    const smooth = (param: AudioParam, v: number) => param.setTargetAtTime(v, t, 0.03)

    smooth(g.pitch.parameters.get('pitch')!, p.pitch)
    smooth(g.dry.gain, 1 - p.robot)
    smooth(g.ringOut.gain, p.robot * 1.6)
    g.shaper.curve = driveCurve(p.drive)
    smooth(g.highpass.frequency, 20 * Math.pow(500 / 20, p.radio))
    smooth(g.lowpass.frequency, 20000 * Math.pow(2800 / 20000, p.radio))
    smooth(g.lowpass.Q, 0.7 + p.radio * 2)
    smooth(g.feedback.gain, p.echo * 0.55)
    smooth(g.echoWet.gain, p.echo * 0.8)
    smooth(g.master.gain, p.volume)
    smooth(g.monitor.gain, this.monitorOn ? 1 : 0)
  }
}

export const voiceEngine = new VoiceEngine()
