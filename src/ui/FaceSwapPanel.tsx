import { useEffect, useReducer, useRef, useState } from 'react'
import { DEFAULT_FACE_PARAMS, faceSwapEngine, type FaceSwapParams } from '../vision/faceSwapEngine'

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

export function FaceSwapPanel({ onClose }: { onClose: () => void }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [params, setParams] = useState<FaceSwapParams>(DEFAULT_FACE_PARAMS)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clip, setClip] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const e = faceSwapEngine

  useEffect(() => {
    e.onChange = rerender
    stage.current?.appendChild(e.canvas)
    return () => {
      e.onChange = null
      e.canvas.remove()
    }
  }, [e])
  useEffect(() => e.setParams(params), [e, params])
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip)), [clip])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const pickFile = (file: File | undefined) => file && run('Scanning face…', () => e.setSource(file))

  const download = (blob: Blob | null, name: string) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const toggleRecord = async () => {
    if (e.recording) {
      const blob = await e.stopRecording()
      if (blob) setClip(URL.createObjectURL(blob))
    } else e.startRecording()
    rerender()
  }

  return (
    <aside className="panel faceswap" role="dialog" aria-label="Face-Swap Lens">
      <header>
        <div>
          <span className="kicker">Module 02</span>
          <h2>Face-Swap Lens</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="stage" ref={stage}>
        {!e.running && <span>Camera off</span>}
        {e.running && !e.tracking && <span className="hint">No face in view</span>}
      </div>

      <div className="row">
        <button
          className={`big ${e.running ? 'on' : ''}`}
          disabled={!!busy}
          onClick={() => (e.running ? e.stop() : run('Loading tracker…', () => e.start()))}
        >
          {busy === 'Loading tracker…' ? busy : e.running ? '■ Camera off' : '● Camera on'}
        </button>
      </div>

      <label
        className="dropzone"
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault()
          pickFile(ev.dataTransfer.files[0])
        }}
      >
        <input type="file" accept="image/*" hidden onChange={(ev) => pickFile(ev.target.files?.[0])} />
        {e.sourceUrl ? <img src={e.sourceUrl} alt="Disguise face" /> : <span className="face-placeholder" />}
        <span>
          {busy === 'Scanning face…' ? busy : e.sourceUrl ? 'Disguise loaded. Drop another photo to swap.' : 'Drop a face photo here, or click to pick one.'}
        </span>
      </label>
      {error && <p className="error">{error}</p>}

      <div className="sliders">
        <label>
          <span>Mask</span>
          <input type="range" min={0} max={1} step={0.01} value={params.opacity}
            onChange={(ev) => setParams({ ...params, opacity: Number(ev.target.value) })} />
          <output>{pct(params.opacity)}</output>
        </label>
        <label>
          <span>Skin match</span>
          <input type="range" min={0} max={1} step={0.01} value={params.colorMatch}
            onChange={(ev) => setParams({ ...params, colorMatch: Number(ev.target.value) })} />
          <output>{pct(params.colorMatch)}</output>
        </label>
      </div>

      <div className="row">
        <label className="toggle">
          <input type="checkbox" checked={params.mirror} onChange={(ev) => setParams({ ...params, mirror: ev.target.checked })} />
          Mirror
        </label>
        <label className="toggle">
          <input type="checkbox" checked={params.showMesh} onChange={(ev) => setParams({ ...params, showMesh: ev.target.checked })} />
          Show tracking mesh
        </label>
      </div>

      <div className="row">
        <button className="big" disabled={!e.running} onClick={async () => download(await e.snapshot(), 'disguise.png')}>
          Snapshot
        </button>
        <button className={`big ${e.recording ? 'rec' : ''}`} disabled={!e.running} onClick={toggleRecord}>
          {e.recording ? '■ Stop' : '● Record'}
        </button>
      </div>
      {clip && (
        <div className="clip">
          <video controls src={clip} />
          <a href={clip} download="disguise.webm">
            Download
          </a>
        </div>
      )}
      <p className="note">Everything runs on this device. Nothing is uploaded.</p>
    </aside>
  )
}
