import { useEffect, useRef, useState } from 'react'
import { closeCamera, fileToImage, openCamera, snapshot } from '../idcard/camera'
import { renderCard } from '../idcard/render'
import { cardStore } from '../idcard/store'
import { DEFAULT_TEMPLATE, type CardData } from '../idcard/template'

const ROLES = ['Mastermind', 'Hacker', 'Getaway Driver', 'Safecracker', 'Inside Man', 'Grifter', 'Lookout', 'Muscle']

const template = DEFAULT_TEMPLATE
const PHOTO_ASPECT = template.photo.w / template.photo.h

function newCrewNo() {
  return `RHC-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`
}

function today() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()
}

export function FakeIdPanel({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const card = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [count, setCount] = useState(0)
  const [flash, setFlash] = useState(false)
  const [photo, setPhoto] = useState<CanvasImageSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CardData>({
    name: '',
    codename: '',
    role: ROLES[0],
    crewNo: newCrewNo(),
    issued: today(),
  })

  // attach stream to <video>, and always release the camera when the panel closes
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
    return () => closeCamera(stream)
  }, [stream])

  // redraw the card preview whenever anything changes
  useEffect(() => {
    if (!card.current) return
    renderCard(card.current, template, data, photo)
      .then(() => card.current && photo && cardStore.set(card.current))
      .catch((e) => setError(String(e)))
  }, [data, photo])

  // countdown, then snap
  useEffect(() => {
    if (count <= 0) return
    const t = setTimeout(() => {
      if (count > 1) return setCount(count - 1)
      setCount(0)
      const v = video.current
      if (!v || !v.videoWidth) return
      setPhoto(snapshot(v, PHOTO_ASPECT))
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
      setStream(null)
    }, 1000)
    return () => clearTimeout(t)
  }, [count])

  const startCamera = async () => {
    setError(null)
    try {
      setStream(await openCamera())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const upload = async (file?: File) => {
    if (!file) return
    setError(null)
    try {
      setStream(null)
      setPhoto(await fileToImage(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const download = () => {
    card.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(data.codename || data.name || 'heist').replace(/\W+/g, '-').toLowerCase()}-crew-id.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const set = (k: keyof CardData) => (e: { target: { value: string } }) => setData({ ...data, [k]: e.target.value })

  return (
    <aside className="panel" role="dialog" aria-label="ID Forge">
      <header>
        <div>
          <span className="kicker">Module 05</span>
          <h2>ID Forge</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {stream && (
        <div className="idf-cam">
          <video ref={video} autoPlay playsInline muted />
          <div className="idf-guide" />
          {count > 0 && <div className="idf-count">{count}</div>}
        </div>
      )}
      <div className="idf-card-wrap">
        <canvas ref={card} className="idf-card" />
        {flash && <div className="idf-flash" />}
      </div>

      <div className="row">
        {stream ? (
          <button className="big on" disabled={count > 0} onClick={() => setCount(3)}>
            {count > 0 ? 'Hold still…' : '● Snap (3s)'}
          </button>
        ) : (
          <button className="big" onClick={startCamera}>
            {photo ? '↺ Retake' : '● Camera on'}
          </button>
        )}
        <label className="idf-upload">
          Upload
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="idf-fields">
        <label>
          <span>Name</span>
          <input value={data.name} onChange={set('name')} placeholder="Rowdy Roadrunner" maxLength={40} />
        </label>
        <label>
          <span>Codename</span>
          <input value={data.codename} onChange={set('codename')} placeholder="The Ghost" maxLength={32} />
        </label>
        <label>
          <span>Role</span>
          <select value={data.role} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Crew no.</span>
          <div className="row">
            <input value={data.crewNo} onChange={set('crewNo')} maxLength={14} />
            <button onClick={() => setData({ ...data, crewNo: newCrewNo() })} aria-label="New number">
              ⟳
            </button>
          </div>
        </label>
      </div>

      <div className="row">
        <button className="big on" disabled={!photo} onClick={download}>
          ⤓ Download PNG
        </button>
      </div>
      <p className="note">Novelty card. Clearly marked, not a real ID.</p>
    </aside>
  )
}
