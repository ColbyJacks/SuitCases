import { useEffect, useReducer, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import {
  Aperture,
  Camera,
  CameraOff,
  Download,
  FlipHorizontal2,
  ImagePlus,
  Loader2,
  ScanFace,
  ShieldCheck,
  Spline,
  X,
} from 'lucide-react'
import { DEFAULT_FACE_PARAMS, faceSwapEngine, type FaceSwapParams } from '../vision/faceSwapEngine'
import { Button, ErrorNote, Note, PanelShell, Section, Slider, Toggle, deviceError } from './PanelShell'

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

function Chip({ tone, children }: { tone: 'green' | 'gold' | 'mute' | 'red'; children: React.ReactNode }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] backdrop-blur-md',
        tone === 'green' && 'border-[#35e07a]/30 bg-black/50 text-[#8cf5b4]',
        tone === 'gold' && 'border-gold/30 bg-black/50 text-gold',
        tone === 'red' && 'border-laser/40 bg-black/50 text-[#ff8a92]',
        tone === 'mute' && 'border-white/10 bg-black/50 text-paper/70',
      )}
    >
      <span
        className={clsx(
          'size-1.5 rounded-full',
          tone === 'green' && 'bg-[#35e07a]',
          tone === 'gold' && 'bg-gold',
          tone === 'red' && 'animate-pulse bg-laser',
          tone === 'mute' && 'bg-white/40',
        )}
      />
      {children}
    </motion.span>
  )
}

export function FaceSwapPanel({ onClose }: { onClose: () => void }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [params, setParams] = useState<FaceSwapParams>(DEFAULT_FACE_PARAMS)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clip, setClip] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const e = faceSwapEngine

  useEffect(() => {
    e.onChange = rerender
    stage.current?.prepend(e.canvas)
    return () => {
      e.onChange = null
      e.canvas.remove()
    }
  }, [e])
  useEffect(() => e.setParams(params), [e, params])
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip)), [clip])

  const run = async (label: string, fn: () => Promise<unknown>, device?: 'camera') => {
    setError(null)
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      setError(device ? deviceError(err, device) : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const pickFile = (file: File | undefined) => file && run('scan', () => e.setSource(file))

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

  const status = !e.running
    ? { live: false, label: 'Standby' }
    : e.tracking
      ? { live: true, label: 'Locked on', tone: 'green' as const }
      : { live: true, label: 'Searching', tone: 'gold' as const }

  return (
    <PanelShell
      id="faceswap"
      wide
      title={
        <>
          Face-Swap <em>Lens</em>
        </>
      }
      status={status}
      onClose={onClose}
    >
      {/* live feed */}
      <div
        ref={stage}
        className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.07] bg-black shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:size-full [&>canvas]:object-cover"
      >
        {/* viewfinder corners */}
        <div className="pointer-events-none absolute inset-3 z-10">
          {['left-0 top-0 border-l border-t', 'right-0 top-0 border-r border-t', 'bottom-0 left-0 border-b border-l', 'bottom-0 right-0 border-b border-r'].map(
            (c) => (
              <span
                key={c}
                className={clsx('absolute size-4 rounded-[3px] transition-colors duration-500', c, e.tracking ? 'border-[#35e07a]/80' : 'border-white/30')}
              />
            ),
          )}
        </div>
        <div className="absolute left-3 top-3 z-20 flex gap-1.5">
          <AnimatePresence>
            {e.recording && (
              <Chip key="rec" tone="red">
                Rec
              </Chip>
            )}
            {e.running && (
              <Chip key="track" tone={e.tracking ? 'green' : 'gold'}>
                {e.tracking ? 'Face locked' : 'No face in view'}
              </Chip>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {!e.running && (
            <motion.div
              key="off"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),transparent_70%)]"
            >
              <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-mute">
                {busy === 'camera' ? <Loader2 className="size-5 animate-spin text-gold" /> : <ScanFace className="size-5" strokeWidth={1.5} />}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-mute">
                {busy === 'camera' ? 'Loading tracker' : 'Camera off'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="-mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
        <Button
          variant={e.running ? 'secondary' : 'primary'}
          icon={busy === 'camera' ? Loader2 : e.running ? CameraOff : Camera}
          className={busy === 'camera' ? '[&>svg]:animate-spin' : undefined}
          disabled={!!busy}
          onClick={() => (e.running ? e.stop() : run('camera', () => e.start(), 'camera'))}
        >
          {busy === 'camera' ? 'Starting…' : e.running ? 'Camera off' : 'Camera on'}
        </Button>
        <Button
          icon={Aperture}
          aria-label="Save snapshot"
          title="Save snapshot"
          disabled={!e.running}
          onClick={async () => download(await e.snapshot(), 'disguise.png')}
          className="w-11 px-0"
        />
        <Button
          variant={e.recording ? 'danger' : 'secondary'}
          aria-label={e.recording ? 'Stop recording' : 'Record'}
          title={e.recording ? 'Stop recording' : 'Record'}
          disabled={!e.running}
          onClick={toggleRecord}
          className="w-11 px-0"
        >
          <span className={clsx('bg-laser transition-all', e.recording ? 'size-2.5 rounded-[3px]' : 'size-3 rounded-full')} />
        </Button>
      </div>

      <AnimatePresence>{error && <ErrorNote key="err">{error}</ErrorNote>}</AnimatePresence>

      <Section label="Disguise">
        <label
          onDragOver={(ev) => {
            ev.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(ev) => {
            ev.preventDefault()
            setDragging(false)
            pickFile(ev.dataTransfer.files[0])
          }}
          className={clsx(
            'group flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed p-2.5 transition-colors',
            dragging ? 'border-gold bg-gold/[0.06]' : 'border-white/15 hover:border-gold/50 hover:bg-white/[0.02]',
          )}
        >
          <input type="file" accept="image/*" hidden onChange={(ev) => pickFile(ev.target.files?.[0])} />
          <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.04] text-mute">
            {e.sourceUrl ? (
              <motion.img
                key={e.sourceUrl}
                initial={{ scale: 1.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={e.sourceUrl}
                alt="Disguise face"
                className="size-full object-cover"
              />
            ) : busy === 'scan' ? (
              <Loader2 className="size-5 animate-spin text-gold" />
            ) : (
              <ImagePlus className="size-5 transition-colors group-hover:text-gold" strokeWidth={1.5} />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-paper/90">
              {busy === 'scan' ? 'Scanning face…' : e.sourceUrl ? 'Disguise loaded' : 'Drop a face photo'}
            </span>
            <span className="text-xs text-mute">
              {e.sourceUrl ? 'Drop another photo to swap faces.' : 'Or click to pick one. Front-facing works best.'}
            </span>
          </span>
        </label>
      </Section>

      <Section label="Blend">
        <div className="flex flex-col gap-1">
          <Slider id="fs-opacity" label="Mask" value={params.opacity} min={0} max={1} format={pct} onChange={(v) => setParams({ ...params, opacity: v })} />
          <Slider
            id="fs-color"
            label="Skin match"
            value={params.colorMatch}
            min={0}
            max={1}
            format={pct}
            onChange={(v) => setParams({ ...params, colorMatch: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Mirror" icon={FlipHorizontal2} checked={params.mirror} onChange={(v) => setParams({ ...params, mirror: v })} />
          <Toggle label="Show mesh" icon={Spline} checked={params.showMesh} onChange={(v) => setParams({ ...params, showMesh: v })} />
        </div>
      </Section>

      <AnimatePresence>
        {clip && (
          <motion.div
            key={clip}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Section
              label="Evidence"
              aside={
                <span className="flex items-center gap-1">
                  <a
                    href={clip}
                    download="disguise.webm"
                    aria-label="Download clip"
                    className="flex size-7 items-center justify-center rounded-lg text-mute transition-colors hover:bg-white/[0.06] hover:text-paper"
                  >
                    <Download className="size-3.5" />
                  </a>
                  <button
                    onClick={() => setClip(null)}
                    aria-label="Discard clip"
                    className="flex size-7 items-center justify-center rounded-lg text-mute transition-colors hover:bg-white/[0.06] hover:text-paper"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              }
            >
              <video controls src={clip} className="w-full rounded-xl border border-white/[0.07] bg-black" />
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      <Note icon={ShieldCheck}>Everything runs on this device. Nothing is uploaded.</Note>
    </PanelShell>
  )
}
