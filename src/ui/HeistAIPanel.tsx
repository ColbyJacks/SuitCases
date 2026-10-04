import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { ChevronDown, Keyboard, Mic, RotateCcw, Send, Square } from 'lucide-react'
import { streamHeistAI, type ChatMessage } from '../ai/heistApi'
import { alfredStatus, resetAlfred, Speaker, talkToAlfred } from '../ai/alfred'
import { toWav } from '../audio/voiceClone'
import { deviceError, ErrorNote, PanelShell } from './PanelShell'

const STARTERS = ['Plan a museum heist for a crew of four', 'Who do I need on my crew?', 'We got spotted. What’s the escape plan?']

/** One exchange: what you said and what Alfred said back, sentence by sentence. */
type Turn = { you: string; alfred: string[] }

// Kept at module level so the conversation survives closing and reopening the panel.
let savedTurns: Turn[] = []
let session = crypto.randomUUID()

type Voice = 'checking' | 'loading' | 'online' | 'offline'
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

/** The text chat fallback still wants a plain message history. */
const toHistory = (turns: Turn[]): ChatMessage[] =>
  turns.flatMap((t) => [
    { role: 'user' as const, content: t.you },
    { role: 'assistant' as const, content: t.alfred.join(' ') },
  ])

/** Alfred's presence: a glowing orb that breathes when idle and swells with whoever is talking. */
function Orb({ phase, voice, level }: { phase: Phase; voice: Voice; level: React.RefObject<number> }) {
  const core = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let smooth = 0
    const tick = () => {
      smooth += (level.current - smooth) * 0.25
      core.current?.style.setProperty('--lvl', smooth.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [level])

  const down = voice === 'offline'
  const listening = phase === 'listening'
  const active = listening || phase === 'speaking'
  return (
    <div className="relative flex size-44 items-center justify-center">
      {/* ripples while someone is talking */}
      {active &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={`${phase}-${i}`}
            className={clsx('absolute inset-6 rounded-full border', listening ? 'border-laser/50' : 'border-gold/50')}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
          />
        ))}
      {/* spinning halo while Alfred thinks */}
      {phase === 'thinking' && (
        <motion.span
          className="absolute inset-3 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(227,181,99,0.65) 90deg, transparent 180deg)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <motion.div
        animate={phase === 'idle' && !down ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
      <div
        ref={core}
        className={clsx(
          'relative size-32 rounded-full transition-[filter,background] duration-500 [transform:scale(calc(1+var(--lvl,0)*0.22))]',
          down && 'grayscale',
        )}
        style={{
          background: listening
            ? 'radial-gradient(circle at 35% 30%, #ffd2d5 0%, #ff3d4a 38%, #5a0d13 78%, #1a0406 100%)'
            : 'radial-gradient(circle at 35% 30%, #fff1cf 0%, #e3b563 36%, #6b4c1c 76%, #1a1206 100%)',
          boxShadow: listening
            ? '0 0 calc(40px + var(--lvl,0) * 80px) rgba(255,61,74,0.55), inset 0 -12px 30px rgba(0,0,0,0.5)'
            : `0 0 calc(${down ? 10 : 36}px + var(--lvl,0) * 90px) rgba(227,181,99,${down ? 0.15 : 0.5}), inset 0 -12px 30px rgba(0,0,0,0.5)`,
        }}
      >
        <span className="absolute left-[22%] top-[16%] h-[22%] w-[34%] rotate-[-25deg] rounded-full bg-white/40 blur-md" />
      </div>
      </motion.div>
    </div>
  )
}

export function HeistAIPanel({ onClose }: { onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>(savedTurns)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voice, setVoice] = useState<Voice>('checking')
  const [rawPhase, setPhase] = useState<Phase>('idle')
  // Between sentences the speaker goes quiet while Alfred is still working on the next one.
  const phase: Phase = rawPhase === 'idle' && busy ? 'thinking' : rawPhase
  const [playingIndex, setPlayingIndex] = useState(-1)
  const [elapsed, setElapsed] = useState(0)
  const [showLog, setShowLog] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const micLevel = useRef<(() => number) | null>(null)
  const level = useRef(0)
  const speaker = useRef<Speaker | null>(null)
  speaker.current ??= new Speaker()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    savedTurns = turns
  }, [turns])

  // Feed the orb whichever voice is live: yours while recording, Alfred's while he talks.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      level.current = micLevel.current ? micLevel.current() : speaker.current!.level()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const s = speaker.current!
    s.onChange = (speaking) => setPhase((p) => (speaking ? 'speaking' : p === 'speaking' ? 'idle' : p))
    s.onSentence = setPlayingIndex
    return () => {
      abort.current?.abort()
      s.stop()
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Look for Alfred's voice server, and keep checking until it's up and its models are loaded.
  useEffect(() => {
    let stopped = false
    let timer = 0
    const check = async () => {
      const { online, ready } = await alfredStatus()
      if (stopped) return
      setVoice(online ? (ready ? 'online' : 'loading') : 'offline')
      if (!ready) timer = window.setTimeout(check, 4000)
    }
    void check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  // CPU speech synthesis can take a while, so show how long Alfred has been thinking.
  useEffect(() => {
    if (phase !== 'thinking') return
    const started = Date.now()
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const voiceOn = voice === 'online'

  const patchLast = (update: (t: Turn) => Turn) =>
    setTurns((prev) => [...prev.slice(0, -1), update(prev[prev.length - 1])])

  const begin = (you: string) => {
    setTurns((prev) => [...prev, { you, alfred: [] }])
    setError(null)
    setBusy(true)
    setPhase('thinking')
    setElapsed(0)
    setPlayingIndex(-1)
    const ctrl = new AbortController()
    abort.current = ctrl
    return ctrl
  }

  const fail = (e: unknown, ctrl: AbortController) => {
    if (ctrl.signal.aborted) return
    setError(e instanceof Error ? e.message : String(e))
    // Drop a turn Alfred never answered.
    setTurns((prev) => (prev[prev.length - 1]?.alfred.length ? prev : prev.slice(0, -1)))
  }

  const finish = () => {
    setBusy(false)
    setPhase((p) => (p === 'thinking' ? (speaker.current!.speaking ? 'speaking' : 'idle') : p))
  }

  /** A spoken turn: what Alfred heard shows up first, then each sentence plays as it arrives. */
  const talk = async (q: { audio: Blob } | { text: string }) => {
    const ctrl = begin('text' in q ? q.text : '')
    let count = 0
    try {
      await talkToAlfred(
        q,
        session,
        (e) => {
          if (e.type === 'user') patchLast((t) => ({ ...t, you: e.text || '(silence)' }))
          if (e.type === 'sentence') {
            patchLast((t) => ({ ...t, alfred: [...t.alfred, e.text] }))
            speaker.current!.enqueue(e.audio, count++)
          }
        },
        ctrl.signal,
      )
    } catch (e) {
      fail(e, ctrl)
    } finally {
      finish()
    }
  }

  /** Without the voice server, Alfred can still answer in text through the Claude endpoint. */
  const textOnly = async (content: string) => {
    const history = [...toHistory(turns), { role: 'user' as const, content }]
    const ctrl = begin(content)
    try {
      await streamHeistAI(history, (chunk) => patchLast((t) => ({ ...t, alfred: [(t.alfred[0] ?? '') + chunk] })), ctrl.signal)
    } catch (e) {
      fail(e, ctrl)
    } finally {
      finish()
    }
  }

  const send = (text: string) => {
    const content = text.trim()
    if (!content || busy || phase === 'listening') return
    setDraft('')
    speaker.current!.prime()
    speaker.current!.stop()
    void (voiceOn ? talk({ text: content }) : textOnly(content))
  }

  const startListening = async () => {
    if (recorder.current || busy || !voiceOn) return
    setError(null)
    speaker.current!.prime()
    speaker.current!.stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      // Tap the mic for a live level so the orb reacts to your voice.
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      micLevel.current = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const s of buf) sum += s * s
        return Math.min(1, Math.sqrt(sum / buf.length) * 6)
      }

      const chunks: Blob[] = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        micLevel.current = null
        recorder.current = null
        setPhase('idle')
        const blob = new Blob(chunks, { type: rec.mimeType })
        if (!blob.size) return
        try {
          await talk({ audio: await toWav(blob) })
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
      rec.start()
      recorder.current = rec
      setPhase('listening')
    } catch (e) {
      setError(deviceError(e, 'microphone'))
    }
  }

  const stopListening = () => recorder.current?.stop()
  const toggleMic = () => (recorder.current ? stopListening() : void startListening())

  const stop = () => {
    abort.current?.abort()
    speaker.current!.stop()
  }

  const reset = () => {
    stop()
    resetAlfred(session)
    session = crypto.randomUUID()
    setTurns([])
    setError(null)
  }

  // Hold Space to talk, like a walkie-talkie (ignored while typing).
  const spaceHeld = useRef(false)
  const toggleRef = useRef({ startListening, stopListening })
  useEffect(() => {
    toggleRef.current = { startListening, stopListening }
  })
  useEffect(() => {
    const typingIn = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typingIn(e)) return
      e.preventDefault()
      spaceHeld.current = true
      void toggleRef.current.startListening()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceHeld.current) return
      spaceHeld.current = false
      toggleRef.current.stopListening()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const current = turns[turns.length - 1]
  const past = turns.slice(0, -1)
  const working = busy || phase === 'speaking'

  const status =
    phase === 'listening'
      ? { live: true, label: 'Listening', tone: 'red' as const }
      : phase === 'speaking'
        ? { live: true, label: 'Speaking', tone: 'gold' as const }
        : busy
          ? { live: true, label: 'Thinking', tone: 'gold' as const }
          : voiceOn
            ? { live: true, label: 'On the line', tone: 'green' as const }
            : { live: false, label: voice === 'offline' ? 'Line down' : 'Connecting' }

  const caption =
    phase === 'listening'
      ? 'Listening… tap again when you’re done'
      : phase === 'thinking'
        ? `Alfred is thinking${elapsed >= 3 ? ` · ${elapsed}s` : '…'}`
        : phase === 'speaking'
          ? 'Alfred is speaking'
          : voice === 'online'
            ? 'Tap the mic or hold Space to talk'
            : voice === 'loading'
              ? 'Alfred is warming up his voice…'
              : voice === 'offline'
                ? 'Voice line is down'
                : 'Dialing Alfred…'

  return (
    <PanelShell
      id="heistai"
      title={
        <>
          Heist<em>AI</em>
        </>
      }
      status={status}
      onClose={onClose}
      bodyClassName="items-center gap-5"
      footer={
        <div className="flex flex-col gap-2.5">
          <AnimatePresence initial={false} mode="popLayout">
            {typing || !voiceOn ? (
              <motion.form
                key="type"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  send(draft)
                }}
                className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/30 p-1.5 pl-3.5 transition-colors focus-within:border-gold/50"
              >
                <input
                  ref={input}
                  value={draft}
                  autoFocus={typing}
                  placeholder={voiceOn ? 'Type to Alfred, he’ll answer out loud…' : 'Type to Alfred…'}
                  aria-label="Message Alfred"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-mute/60"
                />
                {voiceOn && (
                  <button
                    type="button"
                    onClick={() => setTyping(false)}
                    aria-label="Back to voice"
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl text-mute transition-colors hover:bg-white/[0.06] hover:text-paper"
                  >
                    <Mic className="size-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!draft.trim() || busy}
                  aria-label="Send"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#f3d493] to-gold text-ink transition-opacity disabled:opacity-30"
                >
                  <Send className="size-4" strokeWidth={2.25} />
                </button>
              </motion.form>
            ) : (
              <motion.div key="voice" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTyping(true)}
                  aria-label="Type instead"
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] text-mute transition-colors hover:bg-white/[0.05] hover:text-paper"
                >
                  <Keyboard className="size-4" />
                </button>
                {working ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={stop}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] text-sm font-medium text-paper transition-colors hover:bg-white/10"
                  >
                    <Square className="size-3.5 fill-current" />
                    {phase === 'speaking' ? 'Stop Alfred' : 'Cancel'}
                  </motion.button>
                ) : (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={toggleMic}
                    className={clsx(
                      'flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-[filter,background]',
                      phase === 'listening'
                        ? 'bg-laser text-white shadow-[0_8px_24px_-8px_rgba(255,61,74,0.9)]'
                        : 'bg-gradient-to-b from-[#f3d493] to-gold text-ink shadow-[0_8px_24px_-8px_rgba(227,181,99,0.9)] hover:brightness-105',
                    )}
                  >
                    <Mic className={clsx('size-4', phase === 'listening' && 'animate-pulse')} strokeWidth={2.25} />
                    {phase === 'listening' ? 'Send to Alfred' : 'Talk to Alfred'}
                  </motion.button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  disabled={turns.length === 0 || working}
                  aria-label="New plan"
                  title="New plan"
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] text-mute transition-colors hover:bg-white/[0.05] hover:text-paper disabled:opacity-30"
                >
                  <RotateCcw className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2">
        <Orb phase={phase} voice={voice} level={level} />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-mute" aria-live="polite">
          {caption}
        </p>
      </div>

      {voice === 'offline' && (
        <p className="max-w-[300px] text-center text-[12.5px] leading-relaxed text-mute">
          Run <kbd className="font-mono text-paper/70">npm run heistai</kbd> to talk to Alfred out loud. Until then he’ll answer in text.
        </p>
      )}

      {/* the latest exchange, shown as subtitles */}
      <AnimatePresence mode="wait">
        {current ? (
          <motion.div
            key={turns.length}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex w-full flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-mute">You</span>
              <p className="text-[13.5px] leading-relaxed text-paper/70">{current.you || <span className="italic text-mute">Transcribing…</span>}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-gold">Alfred</span>
              <p className="font-display text-[20px] leading-snug text-paper">
                {current.alfred.length === 0 ? (
                  <span className="text-mute/70">…</span>
                ) : (
                  current.alfred.map((s, i) => (
                    <span
                      key={i}
                      className={clsx(
                        'transition-colors duration-300',
                        phase === 'speaking' && playingIndex >= 0 && (i === playingIndex ? 'text-gold' : i > playingIndex ? 'text-paper/45' : 'text-paper'),
                      )}
                    >
                      {s}{' '}
                    </span>
                  ))
                )}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="starters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-mute">Try asking</span>
            {STARTERS.map((text) => (
              <button
                key={text}
                onClick={() => send(text)}
                className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-left text-[12.5px] text-paper/80 transition-colors hover:border-gold/40 hover:bg-gold/[0.05] hover:text-paper"
              >
                “{text}”
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{error && <ErrorNote key="err">{error}</ErrorNote>}</AnimatePresence>

      {/* earlier exchanges, tucked away */}
      {past.length > 0 && (
        <div className="mt-auto w-full">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-mute transition-colors hover:text-paper"
          >
            Earlier on the line ({past.length})
            <ChevronDown className={clsx('size-3.5 transition-transform', showLog && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showLog && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 pt-2">
                  {past.map((t, i) => (
                    <div key={i} className="border-l border-white/10 pl-3 text-[12.5px] leading-relaxed">
                      <p className="text-mute">{t.you}</p>
                      <p className="text-paper/80">{t.alfred.join(' ')}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </PanelShell>
  )
}
