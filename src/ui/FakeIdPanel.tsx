import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { Aperture, Camera, Download, RefreshCw, RotateCcw, ShieldAlert, Upload } from 'lucide-react'
import { closeCamera, fileToImage, openCamera, snapshot } from '../idcard/camera'
import { renderCard } from '../idcard/render'
import { cardStore } from '../idcard/store'
import { DEFAULT_TEMPLATE, type CardData } from '../idcard/template'
import { Button, ErrorNote, Field, Note, PanelShell, Section, deviceError, fieldClass } from './PanelShell'

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
  const [flash, setFlash] = useState(0)
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
      setFlash((f) => f + 1)
      setStream(null)
    }, 1000)
    return () => clearTimeout(t)
  }, [count])

  const startCamera = async () => {
    setError(null)
    try {
      setStream(await openCamera())
    } catch (e) {
      setError(deviceError(e, 'camera'))
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

  const status = stream
    ? { live: true, label: count > 0 ? 'Hold still' : 'Camera live' }
    : photo
      ? { live: true, label: 'Ready to print', tone: 'green' as const }
      : { live: false, label: 'No photo' }

  return (
    <PanelShell
      id="fakeid"
      wide
      title={
        <>
          ID <em>Forge</em>
        </>
      }
      status={status}
      onClose={onClose}
      footer={
        <Button variant="primary" icon={Download} disabled={!photo} onClick={download} className="w-full">
          {photo ? 'Download PNG' : 'Add a photo to print'}
        </Button>
      }
    >
      <AnimatePresence initial={false}>
        {stream && (
          <motion.div
            key="cam"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.5 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/[0.07] bg-black">
              <video ref={video} autoPlay playsInline muted className="block size-full -scale-x-100 object-cover" />
              {/* photo guide cut-out */}
              <div
                className="absolute left-1/2 top-1/2 h-[86%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-dashed border-gold/80 shadow-[0_0_0_999px_rgba(7,8,11,0.55)]"
                style={{ aspectRatio: `${template.photo.w} / ${template.photo.h}` }}
              />
              <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-paper/70">
                Line up your face
              </span>
              <AnimatePresence>
                {count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 1.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ type: 'spring', bounce: 0.4, duration: 0.5 }}
                    className="absolute inset-0 flex items-center justify-center font-display text-[96px] leading-none text-gold [text-shadow:0_4px_40px_rgba(0,0,0,0.9)]"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* card preview */}
      <motion.div
        className="relative shrink-0"
        style={{ transformPerspective: 1200 }}
        initial={{ rotateX: 12, opacity: 0, y: 12 }}
        animate={{ rotateX: 0, opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.8, delay: 0.1 }}
      >
        <canvas
          ref={card}
          className="block w-full rounded-[14px] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)]"
          style={{ aspectRatio: `${template.width} / ${template.height}` }}
        />
        {/* holo sheen */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
          <motion.div
            className="absolute -inset-y-4 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
            animate={{ left: ['-40%', '140%'] }}
            transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut' }}
          />
        </div>
        <AnimatePresence>
          {flash > 0 && (
            <motion.div
              key={flash}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute inset-0 rounded-[14px] bg-white"
            />
          )}
        </AnimatePresence>
      </motion.div>

      <div className="-mt-2 grid shrink-0 grid-cols-[1fr_auto] gap-2">
        {stream ? (
          <Button variant="primary" icon={Aperture} disabled={count > 0} onClick={() => setCount(3)}>
            {count > 0 ? 'Hold still…' : 'Snap in 3 seconds'}
          </Button>
        ) : (
          <Button variant={photo ? 'secondary' : 'primary'} icon={photo ? RotateCcw : Camera} onClick={startCamera}>
            {photo ? 'Retake photo' : 'Camera on'}
          </Button>
        )}
        <label
          className={clsx(
            'flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-paper transition-colors hover:border-white/20 hover:bg-white/[0.07]',
            'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold',
          )}
        >
          <Upload className="size-4" />
          Upload
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>

      <AnimatePresence>{error && <ErrorNote key="err">{error}</ErrorNote>}</AnimatePresence>

      <Section label="Credentials">
        <div className="grid grid-cols-2 gap-3" onKeyDown={(e) => e.stopPropagation()}>
          <Field label="Name">
            <input className={fieldClass} value={data.name} onChange={set('name')} placeholder="Rowdy Roadrunner" maxLength={40} />
          </Field>
          <Field label="Codename">
            <input className={fieldClass} value={data.codename} onChange={set('codename')} placeholder="The Ghost" maxLength={32} />
          </Field>
          <div className="col-span-2">
            <Field label="Crew no.">
              <div className="relative">
                <input className={clsx(fieldClass, 'pr-10 font-mono')} value={data.crewNo} onChange={set('crewNo')} maxLength={14} />
                <motion.button
                  type="button"
                  whileTap={{ rotate: 180 }}
                  onClick={() => setData({ ...data, crewNo: newCrewNo() })}
                  aria-label="New crew number"
                  className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-mute transition-colors hover:bg-white/[0.06] hover:text-gold"
                >
                  <RefreshCw className="size-3.5" />
                </motion.button>
              </div>
            </Field>
          </div>
        </div>
      </Section>

      <Section label="Role">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => {
            const selected = data.role === r
            return (
              <button
                key={r}
                onClick={() => setData({ ...data, role: r })}
                aria-pressed={selected}
                className={clsx(
                  'relative rounded-full border px-3 py-1.5 text-xs transition-colors',
                  selected ? 'border-transparent text-ink' : 'border-white/[0.08] text-paper/75 hover:border-white/20 hover:text-paper',
                )}
              >
                {selected && (
                  <motion.span
                    layoutId="idf-role"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-b from-[#f3d493] to-gold"
                  />
                )}
                <span className="relative font-medium">{r}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Note icon={ShieldAlert}>Novelty card. Clearly marked, not a real ID.</Note>
    </PanelShell>
  )
}
