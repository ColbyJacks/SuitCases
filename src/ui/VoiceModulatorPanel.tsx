import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PARAMS, PRESETS, voiceEngine, type VoiceParams } from '../audio/voiceEngine'

const SLIDERS: { key: keyof VoiceParams; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: 'pitch', label: 'Pitch', min: 0.5, max: 2, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'robot', label: 'Robot', min: 0, max: 1, step: 0.01, fmt: pct },
  { key: 'radio', label: 'Radio', min: 0, max: 1, step: 0.01, fmt: pct },
  { key: 'drive', label: 'Grit', min: 0, max: 1, step: 0.01, fmt: pct },
  { key: 'echo', label: 'Echo', min: 0, max: 1, step: 0.01, fmt: pct },
  { key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, fmt: pct },
]

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

function Scope({ live }: { live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const g = c.getContext('2d')!
    const data = new Float32Array(1024)
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const { width: w, height: h } = c
      g.fillStyle = '#07090a'
      g.fillRect(0, 0, w, h)
      g.strokeStyle = 'rgba(255,170,60,0.12)'
      for (let x = 0; x < w; x += w / 10) g.strokeRect(x, 0, 0, h)
      g.strokeRect(0, h / 2, w, 0)
      const a = voiceEngine.analyser
      g.strokeStyle = '#ffae3c'
      g.lineWidth = 2
      g.beginPath()
      if (a) {
        a.getFloatTimeDomainData(data)
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w
          const y = h / 2 - data[i] * h * 1.2
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
      } else {
        g.moveTo(0, h / 2)
        g.lineTo(w, h / 2)
      }
      g.stroke()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [live])

  return <canvas ref={canvas} className="scope" width={560} height={120} />
}

export function VoiceModulatorPanel({ onClose }: { onClose: () => void }) {
  const [live, setLive] = useState(voiceEngine.running)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<VoiceParams>(DEFAULT_PARAMS)
  const [preset, setPreset] = useState('Natural')
  const [monitor, setMonitor] = useState(true)
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<string | null>(null)

  useEffect(() => voiceEngine.setParams(params), [params])
  useEffect(() => voiceEngine.setMonitor(monitor), [monitor])
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip)), [clip])

  const toggleMic = async () => {
    setError(null)
    try {
      if (voiceEngine.running) {
        await voiceEngine.stop()
        setRecording(false)
        setLive(false)
      } else {
        await voiceEngine.start()
        voiceEngine.setParams(params)
        voiceEngine.setMonitor(monitor)
        setLive(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggleRecord = async () => {
    if (recording) {
      const blob = await voiceEngine.stopRecording()
      setRecording(false)
      if (blob) setClip(URL.createObjectURL(blob))
    } else {
      voiceEngine.startRecording()
      setRecording(true)
    }
  }

  return (
    <aside className="panel" role="dialog" aria-label="Voice Modulator">
      <header>
        <div>
          <span className="kicker">Module 01</span>
          <h2>Voice Modulator</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <Scope live={live} />

      <div className="row">
        <button className={`big ${live ? 'on' : ''}`} onClick={toggleMic}>
          {live ? '■ Mic off' : '● Mic on'}
        </button>
        <label className="toggle">
          <input type="checkbox" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} />
          Hear myself
        </label>
      </div>
      {live && monitor && <p className="note">Use headphones to avoid feedback.</p>}
      {error && <p className="error">Mic unavailable: {error}</p>}

      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={preset === p.name ? 'selected' : ''}
            onClick={() => {
              setPreset(p.name)
              setParams({ ...p.params })
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="sliders">
        {SLIDERS.map((s) => (
          <label key={s.key}>
            <span>{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={params[s.key]}
              onChange={(e) => {
                setPreset('Custom')
                setParams({ ...params, [s.key]: Number(e.target.value) })
              }}
            />
            <output>{s.fmt(params[s.key])}</output>
          </label>
        ))}
      </div>

      <div className="row">
        <button className={`big ${recording ? 'rec' : ''}`} disabled={!live} onClick={toggleRecord}>
          {recording ? '■ Stop recording' : '● Record clip'}
        </button>
      </div>
      {clip && (
        <div className="clip">
          <audio controls src={clip} />
          <a href={clip} download="disguised-voice.webm">
            Download
          </a>
        </div>
      )}
    </aside>
  )
}
