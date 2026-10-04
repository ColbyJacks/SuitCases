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

/** Plays base64 WAV clips back to back, so each sentence starts as soon as the last one ends. */
export class Speaker {
  private queue: string[] = []
  private current: HTMLAudioElement | null = null
  private url: string | null = null
  onChange: (speaking: boolean) => void = () => {}

  get speaking() {
    return this.current !== null
  }

  enqueue(base64Wav: string) {
    const bytes = Uint8Array.from(atob(base64Wav), (c) => c.charCodeAt(0))
    this.queue.push(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })))
    if (!this.current) this.next()
  }

  stop() {
    this.current?.pause()
    this.queue.forEach((u) => URL.revokeObjectURL(u))
    this.queue = []
    this.finish()
    this.onChange(false)
  }

  private finish() {
    if (this.url) URL.revokeObjectURL(this.url)
    this.current = null
    this.url = null
  }

  private next() {
    this.finish()
    const url = this.queue.shift()
    if (!url) return this.onChange(false)
    const audio = new Audio(url)
    this.current = audio
    this.url = url
    audio.onended = () => this.next()
    audio.onerror = () => this.next()
    this.onChange(true)
    audio.play().catch(() => this.next())
  }
}
