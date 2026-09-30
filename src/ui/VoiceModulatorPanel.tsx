import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import {
  Bot,
  Crown,
  Download,
  Ghost,
  Headphones,
  Mic,
  Pause,
  Play,
  Radio,
  Squirrel,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { DEFAULT_PARAMS, PRESETS, voiceEngine, type VoiceParams } from '../audio/voiceEngine'

const PRESET_META: Record<string, { icon: LucideIcon; blurb: string }> = {
  Natural: { icon: UserRound, blurb: 'Your own voice' },
  'Deep Boss': { icon: Crown, blurb: 'Low and unhurried' },
  Chipmunk: { icon: Squirrel, blurb: 'Helium high' },
  Robot: { icon: Bot, blurb: 'Ring-modulated' },
  Radio: { icon: Radio, blurb: 'Walkie-talkie' },
  Phantom: { icon: Ghost, blurb: 'Echo from nowhere' },
}

const SLIDERS: { key: keyof VoiceParams; label: string; min: number; max: number; fmt: (v: number) => string }[] = [
  { key: 'pitch', label: 'Pitch', min: 0.5, max: 2, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'robot', label: 'Robot', min: 0, max: 1, fmt: pct },
  { key: 'radio', label: 'Radio', min: 0, max: 1, fmt: pct },
  { key: 'drive', label: 'Grit', min: 0, max: 1, fmt: pct },
  { key: 'echo', label: 'Echo', min: 0, max: 1, fmt: pct },
  { key: 'volume', label: 'Output', min: 0, max: 1.5, fmt: pct },
]

function pct(v: number) {
  return `${Math.round(v * 100)}%`
}

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

const BARS = 40

/** Kokonut "AI voice"-style mic control: round button, timer, and bars that follow the real spectrum. */
function MicControl({ live, onToggle }: { live: boolean; onToggle: () => void }) {
  const bars = useRef<(HTMLDivElement | null)[]>([])
  const halo = useRef<HTMLDivElement>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!live) {
      setElapsed(0)
      return
    }
    const t0 = performance.now()
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 250)
    return () => clearInterval(id)
  }, [live])

  useEffect(() => {
    const data = new Uint8Array(512)
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const a = voiceEngine.analyser
      if (a) a.getByteFrequencyData(data)
      for (let i = 0; i < BARS; i++) {
        const el = bars.current[i]
        if (!el) continue
        // mirror around the centre, log-ish bin spacing
        const k = Math.abs(i - (BARS - 1) / 2) / (BARS / 2)
        const bin = Math.floor(2 + Math.pow(k, 1.6) * 120)
        const v = a ? data[bin] / 255 : 0
        el.style.transform = `scaleY(${0.08 + v * 0.92})`
        el.style.opacity = String(a ? 0.35 + v * 0.65 : 0.25)
      }
      if (halo.current) {
        const level = voiceEngine.getLevel()
        halo.current.style.transform = `scale(${1 + level * 0.6})`
        halo.current.style.opacity = String(live ? 0.25 + level * 0.75 : 0)
      }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [live])

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative">
        <div ref={halo} className="absolute -inset-3 rounded-full bg-gold/30 blur-xl transition-opacity" />
        <motion.button
          onClick={onToggle}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          aria-label={live ? 'Turn microphone off' : 'Turn microphone on'}
          className={clsx(
            'relative flex size-[72px] items-center justify-center rounded-full border transition-colors duration-500',
            live
              ? 'border-gold/60 bg-gradient-to-b from-[#3a2a12] to-[#1a1208] text-gold'
              : 'border-white/10 bg-white/[0.04] text-paper hover:border-white/20',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {live ? (
              <motion.span
                key="stop"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 90 }}
                className="size-5 animate-spin rounded-[5px] bg-gold [animation-duration:3s]"
              />
            ) : (
              <motion.span key="mic" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Mic className="size-6" strokeWidth={1.75} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
      <span className={clsx('font-mono text-sm tabular-nums transition-colors', live ? 'text-paper/80' : 'text-paper/30')}>
        {mmss(elapsed)}
      </span>
      <div className="flex h-8 w-full max-w-[260px] items-center justify-center gap-[3px]">
        {Array.from({ length: BARS }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              bars.current[i] = el
            }}
            className="h-full w-[3px] origin-center rounded-full bg-gradient-to-b from-[#f7dfa8] to-gold will-change-transform"
            style={{ transform: 'scaleY(0.08)', opacity: 0.25 }}
          />
        ))}
      </div>
      <p className="h-4 text-xs text-mute">{live ? 'Live. Speak and hear the disguise.' : 'Tap to go live'}</p>
    </div>
  )
}

function Section({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-mute">{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function ClipPlayer({ url, onClear }: { url: string; onClear: () => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 8, height: 0 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2 pr-3">
        <button
          onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}
          className="flex size-9 items-center justify-center rounded-lg bg-paper text-ink transition-transform active:scale-95"
          aria-label={playing ? 'Pause clip' : 'Play clip'}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-xs text-paper/80">disguised-voice.webm</span>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <a href={url} download="disguised-voice.webm" className="text-mute transition-colors hover:text-paper" aria-label="Download clip">
          <Download className="size-4" />
        </a>
        <button onClick={onClear} className="text-mute transition-colors hover:text-paper" aria-label="Discard clip">
          <X className="size-4" />
        </button>
        <audio
          ref={audio}
          src={url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setProgress(0)
          }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget
            if (Number.isFinite(a.duration) && a.duration > 0) setProgress(a.currentTime / a.duration)
          }}
        />
      </div>
    </motion.div>
  )
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
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        /denied|not allowed|permission/i.test(msg)
          ? 'Microphone access was blocked. Allow the mic for this site in your browser, then try again.'
          : `The microphone didn’t start: ${msg}`,
      )
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
    <motion.aside
      role="dialog"
      aria-label="Voice Modulator"
      initial={{ x: 60, opacity: 0, filter: 'blur(12px)' }}
      animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
      exit={{ x: 60, opacity: 0, filter: 'blur(12px)' }}
      transition={{ type: 'spring', bounce: 0.18, duration: 0.7 }}
      className="glow-border grain pointer-events-auto fixed inset-x-3 bottom-3 z-30 flex max-h-[64vh] flex-col rounded-3xl border border-white/[0.07] bg-ink-2/80 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:left-auto md:bottom-5 md:right-5 md:top-5 md:max-h-none md:w-[380px]"
    >
      <header className="flex items-start gap-3 border-b border-white/[0.06] p-5 pb-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f3d493] via-gold to-gold-dim text-ink shadow-[0_8px_24px_-6px_rgba(227,181,99,0.6)]">
          <Mic className="size-5" strokeWidth={2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-mute">
            Module 01 · VOX-7
            <span className={clsx('flex items-center gap-1.5 transition-colors', live ? 'text-[#ff8a92]' : 'text-mute/70')}>
              <span className={clsx('size-1.5 rounded-full', live ? 'animate-pulse bg-laser' : 'bg-white/25')} />
              {live ? 'Live' : 'Standby'}
            </span>
          </span>
          <h2 className="whitespace-nowrap font-display text-[27px] leading-none text-paper">
            Voice <em>Modulator</em>
          </h2>
        </div>
        <div className="flex items-center">
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-mute transition-colors hover:bg-white/[0.06] hover:text-paper"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-6 overflow-y-auto p-5 [scrollbar-width:thin]">
        <MicControl live={live} onToggle={toggleMic} />

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="-mt-3 rounded-xl border border-laser/30 bg-laser/10 px-3 py-2 text-xs leading-relaxed text-[#ffb3b8]"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <label className="-mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <span className="flex items-center gap-2.5 text-sm text-paper/85">
            <Headphones className="size-4 text-mute" />
            Hear myself
            <span className="text-xs text-mute">(use headphones)</span>
          </span>
          <input type="checkbox" className="peer sr-only" checked={monitor} onChange={(e) => setMonitor(e.target.checked)} />
          <span className="relative h-5 w-9 rounded-full bg-white/10 transition-colors peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-checked:[&>span]:translate-x-4">
            <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-paper shadow transition-transform" />
          </span>
        </label>

        <Section label="Disguise">
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const meta = PRESET_META[p.name]
              const Icon = meta.icon
              const selected = preset === p.name
              return (
                <motion.button
                  key={p.name}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setPreset(p.name)
                    setParams({ ...p.params })
                  }}
                  aria-pressed={selected}
                  className={clsx(
                    'relative flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-colors',
                    selected ? 'border-transparent' : 'border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03]',
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="preset-highlight"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      className="absolute inset-0 rounded-xl border border-gold/50 bg-gradient-to-b from-gold/[0.16] to-gold/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_-8px_rgba(227,181,99,0.6)]"
                    />
                  )}
                  <Icon className={clsx('relative size-4', selected ? 'text-gold' : 'text-mute')} strokeWidth={1.75} />
                  <span className="relative flex flex-col">
                    <span className={clsx('text-[13px] font-medium', selected ? 'text-paper' : 'text-paper/80')}>{p.name}</span>
                    <span className="text-[11px] leading-tight text-mute">{meta.blurb}</span>
                  </span>
                </motion.button>
              )
            })}
          </div>
        </Section>

        <Section
          label="Fine tune"
          aside={
            preset === 'Custom' ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold/80">Custom</span>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-1">
            {SLIDERS.map((s) => {
              const v = params[s.key]
              const fill = ((v - s.min) / (s.max - s.min)) * 100
              return (
                <label key={s.key} htmlFor={`vox-${s.key}`} className="grid grid-cols-[64px_1fr_52px] items-center gap-3 text-[13px]">
                  <span className="text-paper/75">{s.label}</span>
                  <input
                    id={`vox-${s.key}`}
                    type="range"
                    className="slider w-full"
                    min={s.min}
                    max={s.max}
                    step={0.01}
                    value={v}
                    style={{ ['--fill' as string]: `${fill}%` }}
                    onChange={(e) => {
                      setPreset('Custom')
                      setParams({ ...params, [s.key]: Number(e.target.value) })
                    }}
                  />
                  <output className="text-right font-mono text-xs tabular-nums text-gold/90">{s.fmt(v)}</output>
                </label>
              )
            })}
          </div>
        </Section>

        <Section label="Evidence">
          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={!live}
            onClick={toggleRecord}
            className={clsx(
              'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              recording
                ? 'border-laser/50 bg-laser/15 text-[#ffb3b8]'
                : 'border-white/10 bg-white/[0.04] text-paper hover:border-white/20 hover:bg-white/[0.07]',
            )}
          >
            <span className={clsx('size-2.5 rounded-full bg-laser', recording && 'animate-pulse')} />
            {recording ? 'Stop recording' : live ? 'Record a clip' : 'Go live to record'}
          </motion.button>
          <AnimatePresence>{clip && <ClipPlayer key={clip} url={clip} onClear={() => setClip(null)} />}</AnimatePresence>
        </Section>
      </div>
    </motion.aside>
  )
}
