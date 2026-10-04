import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import {
  AudioLines,
  Bot,
  Crown,
  Download,
  Ghost,
  Headphones,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ServerOff,
  SlidersHorizontal,
  Sparkles,
  Squirrel,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { DEFAULT_PARAMS, PRESETS, voiceEngine, type VoiceParams } from '../audio/voiceEngine'
import { convertVoice, fetchVoices, toWav, type CloneVoice } from '../audio/voiceClone'
import { Button, ErrorNote, Note, PanelShell, Section, Slider, Toggle, deviceError } from './PanelShell'

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
function MicControl({ live, liveHint, onToggle }: { live: boolean; liveHint: string; onToggle: () => void }) {
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
      <p className="h-4 text-xs text-mute">{live ? liveHint : 'Tap to go live'}</p>
    </div>
  )
}

function ClipPlayer({ url, name, onClear }: { url: string; name: string; onClear: () => void }) {
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
          <span className="truncate text-xs text-paper/80">{name}</span>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <a href={url} download={name}className="text-mute transition-colors hover:text-paper" aria-label="Download clip">
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


type Mode = 'clone' | 'quick'

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: 'clone', label: 'Voice clone', icon: Sparkles },
  { id: 'quick', label: 'Quick disguise', icon: SlidersHorizontal },
]

function ModeSwitch({ mode, disabled, onChange }: { mode: Mode; disabled: boolean; onChange: (m: Mode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-black/20 p-1">
      {MODES.map(({ id, label, icon: Icon }) => {
        const selected = mode === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            disabled={disabled && !selected}
            aria-pressed={selected}
            className={clsx(
              'relative flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              selected ? 'text-paper' : 'text-mute hover:text-paper/80',
            )}
          >
            {selected && (
              <motion.span
                layoutId="voice-mode"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                className="absolute inset-0 rounded-lg border border-gold/40 bg-gradient-to-b from-gold/[0.16] to-gold/[0.04]"
              />
            )}
            <Icon className={clsx('relative size-4', selected ? 'text-gold' : 'text-mute')} strokeWidth={1.75} />
            <span className="relative">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function semis(v: number) {
  return v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v} st`
}

type Clip = { url: string; name: string }

export function VoiceModulatorPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('clone')
  const [live, setLive] = useState(voiceEngine.running)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<VoiceParams>(DEFAULT_PARAMS)
  const [preset, setPreset] = useState('Natural')
  const [monitor, setMonitor] = useState(true)
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<Clip | null>(null)

  // Voice clone (RVC server). voices === null while we're still checking.
  const [voices, setVoices] = useState<CloneVoice[] | null>(null)
  const [serverDown, setServerDown] = useState(false)
  const [voice, setVoice] = useState<string | null>(null)
  const [pitch, setPitch] = useState(0)
  const [cloning, setCloning] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const clone = mode === 'clone'

  const loadVoices = useCallback(async (initial = false) => {
    if (!initial) setVoices(null)
    try {
      const list = await fetchVoices()
      setVoices(list)
      setServerDown(false)
      setVoice((cur) => (cur && list.some((v) => v.id === cur) ? cur : (list[0]?.id ?? null)))
    } catch {
      setVoices([])
      setServerDown(true)
      // No server: open on the in-browser disguise so the module still just works.
      if (initial) setMode('quick')
    }
  }, [])

  useEffect(() => void loadVoices(true), [loadVoices])
  useEffect(() => () => abort.current?.abort(), [])

  // Clone mode records your natural voice and you hear the result afterwards, so the live chain stays clean and quiet.
  useEffect(() => voiceEngine.setParams(clone ? DEFAULT_PARAMS : params), [clone, params])
  useEffect(() => voiceEngine.setMonitor(clone ? false : monitor), [clone, monitor])
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip])

  const toggleMic = async () => {
    setError(null)
    try {
      if (voiceEngine.running) {
        await voiceEngine.stop()
        setRecording(false)
        setLive(false)
      } else {
        await voiceEngine.start()
        voiceEngine.setParams(clone ? DEFAULT_PARAMS : params)
        voiceEngine.setMonitor(clone ? false : monitor)
        setLive(true)
      }
    } catch (e) {
      setError(deviceError(e, 'microphone'))
    }
  }

  const toggleRecord = async () => {
    if (recording) {
      const blob = await voiceEngine.stopRecording()
      setRecording(false)
      if (blob) setClip({ url: URL.createObjectURL(blob), name: 'disguised-voice.webm' })
    } else {
      voiceEngine.startRecording()
      setRecording(true)
    }
  }

  const toggleCloneRecord = async () => {
    setError(null)
    if (!recording) {
      voiceEngine.startRecording({ raw: true })
      setRecording(true)
      return
    }
    const blob = await voiceEngine.stopRecording()
    setRecording(false)
    if (!blob || !voice) return
    setCloning(true)
    abort.current = new AbortController()
    try {
      const wav = await toWav(blob)
      if (wav.size < 44 + 16000 * 2 * 0.3) throw new Error('That was too short. Say a full sentence and try again.')
      const out = await convertVoice(wav, voice, pitch, abort.current.signal)
      setClip({ url: URL.createObjectURL(out), name: `${voice}-clone.wav` })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      // A dropped proxy connection means the Python server went away mid-request.
      if (/failed to fetch|unavailable|\(50[234]\)/i.test(msg)) setServerDown(true)
      setError(msg)
    } finally {
      setCloning(false)
    }
  }

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setError(null)
    setClip(null)
    setMode(m)
    if (m === 'clone' && serverDown) void loadVoices()
  }

  const status = cloning
    ? { live: true, label: 'Cloning', tone: 'gold' as const }
    : live
      ? { live: true, label: recording ? 'Recording' : 'Live' }
      : { live: false, label: 'Standby' }

  return (
    <PanelShell
      id="voice"
      title={
        <>
          Voice <em>Modulator</em>
        </>
      }
      status={status}
      onClose={onClose}
    >
      <ModeSwitch mode={mode} disabled={recording || cloning} onChange={switchMode} />

      <MicControl
        live={live}
        liveHint={clone ? 'Live. Record a line to clone it.' : 'Live. Speak and hear the disguise.'}
        onToggle={toggleMic}
      />

      <AnimatePresence>{error && <ErrorNote key="err">{error}</ErrorNote>}</AnimatePresence>

      {clone ? (
        <>
          <Section
            label="Voice"
            aside={
              <button
                onClick={() => void loadVoices()}
                disabled={voices === null || cloning}
                className="text-mute transition-colors hover:text-paper disabled:opacity-40"
                aria-label="Rescan voices"
              >
                <RefreshCw className={clsx('size-3.5', voices === null && 'animate-spin')} />
              </button>
            }
          >
            {serverDown ? (
              <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs leading-relaxed text-paper/75">
                <span className="flex items-center gap-2 text-paper/90">
                  <ServerOff className="size-4 text-laser" /> Voice server offline
                </span>
                <span>
                  Run <code className="font-mono text-gold/90">npm run voice</code> next to the dev server to clone voices, or use
                  Quick disguise, which runs right here in the browser.
                </span>
                <Button variant="secondary" icon={SlidersHorizontal} onClick={() => switchMode('quick')}>
                  Use Quick disguise
                </Button>
              </div>
            ) : voices === null ? (
              <Note>Looking for voices…</Note>
            ) : voices.length === 0 ? (
              <Note icon={AudioLines}>No voices yet. Drop .pth files into voice-server/models and rescan.</Note>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {voices.map((v) => {
                  const selected = voice === v.id
                  return (
                    <motion.button
                      key={v.id}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setVoice(v.id)}
                      disabled={cloning}
                      aria-pressed={selected}
                      className={clsx(
                        'relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                        selected ? 'border-transparent' : 'border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03]',
                      )}
                    >
                      {selected && (
                        <motion.span
                          layoutId="clone-voice"
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                          className="absolute inset-0 rounded-xl border border-gold/50 bg-gradient-to-b from-gold/[0.16] to-gold/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_-8px_rgba(227,181,99,0.6)]"
                        />
                      )}
                      <AudioLines className={clsx('relative size-4 shrink-0', selected ? 'text-gold' : 'text-mute')} strokeWidth={1.75} />
                      <span className="relative flex min-w-0 flex-col">
                        <span className={clsx('truncate text-[13px] font-medium', selected ? 'text-paper' : 'text-paper/80')}>{v.name}</span>
                        <span className="text-[11px] leading-tight text-mute">{v.hasIndex ? 'RVC + index' : 'RVC model'}</span>
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            )}
          </Section>

          <Section label="Fine tune">
            <Slider id="vox-clone-pitch" label="Pitch" value={pitch} min={-12} max={12} step={1} format={semis} onChange={setPitch} />
            <p className="text-[11px] leading-relaxed text-mute">
              Shift to meet the target voice's range: about +12 for a deep voice into a high one, −12 the other way.
            </p>
          </Section>

          <Section label="Evidence">
            <Button
              variant={recording ? 'danger' : cloning ? 'secondary' : 'primary'}
              disabled={!live || !voice || serverDown || cloning}
              onClick={toggleCloneRecord}
              icon={cloning ? Sparkles : undefined}
              className={clsx(cloning && '[&>svg]:animate-pulse')}
            >
              {!cloning && <span className={clsx('size-2.5 rounded-full bg-laser', recording && 'animate-pulse')} />}
              {cloning ? 'Cloning voice…' : recording ? 'Stop and clone' : !live ? 'Go live to record' : 'Record a line'}
            </Button>
            <AnimatePresence>{clip && <ClipPlayer key={clip.url} url={clip.url} name={clip.name} onClear={() => setClip(null)} />}</AnimatePresence>
          </Section>
        </>
      ) : (
        <>
          <div className="-mt-2">
            <Toggle label="Hear myself" hint="use headphones" icon={Headphones} checked={monitor} onChange={setMonitor} />
          </div>

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
              preset === 'Custom' ? <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold/80">Custom</span> : undefined
            }
          >
            <div className="flex flex-col gap-1">
              {SLIDERS.map((s) => (
                <Slider
                  key={s.key}
                  id={`vox-${s.key}`}
                  label={s.label}
                  value={params[s.key]}
                  min={s.min}
                  max={s.max}
                  format={s.fmt}
                  onChange={(v) => {
                    setPreset('Custom')
                    setParams({ ...params, [s.key]: v })
                  }}
                />
              ))}
            </div>
          </Section>

          <Section label="Evidence">
            <Button variant={recording ? 'danger' : 'secondary'} disabled={!live} onClick={toggleRecord}>
              <span className={clsx('size-2.5 rounded-full bg-laser', recording && 'animate-pulse')} />
              {recording ? 'Stop recording' : live ? 'Record a clip' : 'Go live to record'}
            </Button>
            <AnimatePresence>{clip && <ClipPlayer key={clip.url} url={clip.url} name={clip.name} onClear={() => setClip(null)} />}</AnimatePresence>
          </Section>
        </>
      )}
    </PanelShell>
  )
}
