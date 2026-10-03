/**
 * Browser side of the RVC voice clone. Talks to the local Python server in
 * voice-server/, which Vite proxies under /api/voice (see vite.config.ts).
 */

export type CloneVoice = { id: string; name: string; hasIndex: boolean }

const BASE = '/api/voice'

/** Lists the .pth voices in voice-server/models. Throws if the server isn't running. */
export async function fetchVoices(signal?: AbortSignal): Promise<CloneVoice[]> {
  const res = await fetch(`${BASE}/voices`, { signal })
  if (!res.ok) throw new Error(`Voice server unavailable (${res.status})`)
  const data = await res.json()
  return data.voices
}

/** Sends a WAV clip through the chosen voice and returns the cloned WAV. */
export async function convertVoice(wav: Blob, voice: string, pitch: number, signal?: AbortSignal): Promise<Blob> {
  const form = new FormData()
  form.append('audio', wav, 'clip.wav')
  form.append('voice', voice)
  form.append('pitch', String(Math.round(pitch)))
  const res = await fetch(`${BASE}/convert`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail ?? `Voice conversion failed (${res.status})`)
  }
  return res.blob()
}

// RVC resamples everything to 16 kHz mono, so send it that way and keep uploads small.
const TARGET_RATE = 16000

/** Decodes a MediaRecorder clip (webm/ogg) and re-encodes it as 16 kHz mono 16-bit WAV. */
export async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE))
  const offline = new OfflineAudioContext(1, length, TARGET_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const mono = (await offline.startRendering()).getChannelData(0)
  return encodeWav(mono, TARGET_RATE)
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}
