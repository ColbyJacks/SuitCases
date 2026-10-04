/**
 * Browser side of HeistAI's voice mode. Talks to the local Python server in
 * heistai-server/, which Vite proxies under /api/alfred (see vite.config.ts).
 */

export type AlfredEvent =
  | { type: 'user'; text: string }
  | { type: 'sentence'; text: string; audio: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

const BASE = '/api/alfred'

/** True when the voice server is up. `ready` turns true once its models have loaded. */
export async function alfredStatus(signal?: AbortSignal): Promise<{ online: boolean; ready: boolean }> {
  try {
    const res = await fetch(`${BASE}/health`, { signal })
    if (!res.ok) return { online: false, ready: false }
    const data = await res.json()
    return { online: !!data.ok, ready: !!data.ready }
  } catch {
    return { online: false, ready: false }
  }
}

/** Sends a recording (or typed text) to Alfred and calls onEvent as his reply streams in, sentence by sentence. */
export async function talkToAlfred(
  input: { audio: Blob } | { text: string },
  session: string,
  onEvent: (e: AlfredEvent) => void,
  signal?: AbortSignal,
) {
  const form = new FormData()
  if ('audio' in input) form.append('audio', input.audio, 'question.wav')
  else form.append('text', input.text)
  form.append('session', session)

  const res = await fetch(`${BASE}/talk`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail ?? `Alfred didn't pick up (${res.status})`)
  }

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as AlfredEvent
      if (event.type === 'error') throw new Error(event.message)
      onEvent(event)
    }
  }
}

export function resetAlfred(session: string) {
  const form = new FormData()
  form.append('session', session)
  void fetch(`${BASE}/reset`, { method: 'POST', body: form }).catch(() => {})
}

/**
 * Plays Alfred's sentences back to back through Web Audio, so each one starts as soon as the
 * last ends, and exposes a live level so the UI can pulse with his voice.
 */
export class Speaker {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private samples = new Float32Array(1024)
  private queue: { data: Promise<AudioBuffer | null>; index: number }[] = []
  private source: AudioBufferSourceNode | null = null
  private playing = false
  private generation = 0
  /** Fires with true when Alfred starts talking and false when the queue runs dry. */
  onChange: (speaking: boolean) => void = () => {}
  /** Fires with the index of the sentence that just started playing. */
  onSentence: (index: number) => void = () => {}

  get speaking() {
    return this.playing
  }

  /** Call from a click or tap so the browser lets audio play. */
  prime() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.connect(this.ctx.destination)
    }
    void this.ctx.resume()
  }

  enqueue(base64Wav: string, index: number) {
    this.prime()
    const bytes = Uint8Array.from(atob(base64Wav), (c) => c.charCodeAt(0))
    // Decode right away so the next sentence is ready the moment the current one ends.
    const data = this.ctx!.decodeAudioData(bytes.buffer).catch(() => null)
    this.queue.push({ data, index })
    if (!this.playing) void this.next()
  }

  /** Loudness of what's playing right now, 0..1. */
  level() {
    if (!this.analyser || !this.playing) return 0
    this.analyser.getFloatTimeDomainData(this.samples)
    let sum = 0
    for (const s of this.samples) sum += s * s
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4)
  }

  stop() {
    this.generation++
    this.queue = []
    if (this.source) {
      this.source.onended = null
      this.source.stop()
      this.source = null
    }
    if (this.playing) {
      this.playing = false
      this.onChange(false)
    }
  }

  private async next(): Promise<void> {
    const item = this.queue.shift()
    if (!item) {
      this.playing = false
      this.onChange(false)
      return
    }
    if (!this.playing) {
      this.playing = true
      this.onChange(true)
    }
    const gen = this.generation
    const buffer = await item.data
    if (gen !== this.generation) return
    if (!buffer) return this.next()
    const src = this.ctx!.createBufferSource()
    src.buffer = buffer
    src.connect(this.analyser!)
    src.onended = () => {
      this.source = null
      void this.next()
    }
    this.source = src
    this.onSentence(item.index)
    src.start()
  }
}
