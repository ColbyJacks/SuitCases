import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { ArrowUp, Bot, Briefcase, Landmark, Mic, RotateCcw, Siren, Square, Users, type LucideIcon } from 'lucide-react'
import { streamHeistAI, type ChatMessage } from '../ai/heistApi'
import { alfredStatus, resetAlfred, Speaker, talkToAlfred } from '../ai/alfred'
import { toWav } from '../audio/voiceClone'
import { deviceError, ErrorNote, PanelShell } from './PanelShell'

const STARTERS: { icon: LucideIcon; text: string }[] = [
  { icon: Landmark, text: 'Plan a museum heist for a crew of four' },
  { icon: Users, text: 'Who do I need on my crew?' },
  { icon: Siren, text: 'We got spotted. What’s the escape plan?' },
  { icon: Briefcase, text: 'Which gadget in this case should I use first?' },
]

const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'HeistAI online. Tell me the mark and I’ll draw up the plan. Or pick a starter below.',
}

const VOICE_GREETING: ChatMessage = {
  role: 'assistant',
  content: 'Alfred here, on the line. Hit the mic and talk to me, or type if you’d rather keep it quiet.',
}

// Kept at module level so the conversation survives closing and reopening the panel.
let savedChat: ChatMessage[] = []
let session = crypto.randomUUID()

type Voice = 'checking' | 'loading' | 'online' | 'offline'
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

function Typing({ dark }: { dark?: boolean }) {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="HeistAI is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={clsx('size-1.5 rounded-full', dark ? 'bg-ink' : 'bg-gold')}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
      className={clsx('flex gap-2.5', mine ? 'justify-end' : 'justify-start')}
    >
      {!mine && (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <Bot className="size-3.5" strokeWidth={2} />
        </span>
      )}
      <div
        className={clsx(
          'max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-[13.5px] leading-relaxed [overflow-wrap:anywhere]',
          mine
            ? 'rounded-2xl rounded-tr-md bg-gradient-to-b from-[#f3d493] to-gold text-ink shadow-[0_8px_24px_-12px_rgba(227,181,99,0.7)]'
            : 'rounded-2xl rounded-tl-md border border-white/[0.06] bg-white/[0.035] text-paper/90',
        )}
      >
        {message.content || <Typing dark={mine} />}
      </div>
    </motion.div>
  )
}

export function HeistAIPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(savedChat)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voice, setVoice] = useState<Voice>('checking')
  const [phase, setPhase] = useState<Phase>('idle')
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const speaker = useRef<Speaker | null>(null)
  speaker.current ??= new Speaker()

  useEffect(() => {
    savedChat = messages
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, error])

  useEffect(() => {
    const s = speaker.current!
    s.onChange = (speaking) => setPhase((p) => (speaking ? 'speaking' : p === 'speaking' ? 'idle' : p))
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

  const voiceOn = voice === 'online'

  const fail = (e: unknown, ctrl: AbortController) => {
    if (ctrl.signal.aborted) return false
    setError(e instanceof Error ? e.message : String(e))
    // Drop the empty assistant bubble (and an unheard question) so the log stays clean.
    setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -2)))
    return true
  }

  /** One spoken turn with Alfred: his sentences appear and play as they arrive. */
  const talk = async (input: { audio: Blob } | { text: string }) => {
    const heard = 'text' in input ? input.text : ''
    setMessages((prev) => [...prev, { role: 'user', content: heard }, { role: 'assistant', content: '' }])
    setDraft('')
    setError(null)
    setBusy(true)
    setPhase('thinking')

    const ctrl = new AbortController()
    abort.current = ctrl
    const patch = (fromEnd: number, update: (content: string) => string) =>
      setMessages((prev) => {
        const next = prev.slice()
        const i = next.length - fromEnd
        next[i] = { ...next[i], content: update(next[i].content) }
        return next
      })

    try {
      await talkToAlfred(
        input,
        session,
        (e) => {
          if (e.type === 'user') patch(2, () => e.text || '(silence)')
          if (e.type === 'sentence') {
            patch(1, (c) => (c ? `${c} ${e.text}` : e.text))
            speaker.current!.enqueue(e.audio)
          }
        },
        ctrl.signal,
      )
    } catch (e) {
      if (fail(e, ctrl) && 'text' in input) setDraft(input.text)
    } finally {
      setBusy(false)
      setPhase((p) => (p === 'thinking' ? (speaker.current!.speaking ? 'speaking' : 'idle') : p))
    }
  }

  const toggleMic = async () => {
    const rec = recorder.current
    if (rec) {
      rec.stop()
      return
    }
    setError(null)
    speaker.current!.stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const chunks: Blob[] = []
      const next = new MediaRecorder(stream)
      next.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      next.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        recorder.current = null
        setPhase('idle')
        const blob = new Blob(chunks, { type: next.mimeType })
        if (!blob.size) return
        try {
          await talk({ audio: await toWav(blob) })
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
      next.start()
      recorder.current = next
      setPhase('listening')
    } catch (e) {
      setError(deviceError(e, 'microphone'))
    }
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    if (voiceOn) return talk({ text: content })
    const history: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setDraft('')
    setError(null)
    setBusy(true)

    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      await streamHeistAI(
        history,
        (chunk) =>
          setMessages((prev) => {
            const next = prev.slice()
            const last = next[next.length - 1]
            next[next.length - 1] = { ...last, content: last.content + chunk }
            return next
          }),
        ctrl.signal,
      )
    } catch (e) {
      // Put the question back in the box.
      if (fail(e, ctrl)) setDraft(content)
    } finally {
      setBusy(false)
    }
  }

  const stop = () => {
    abort.current?.abort()
    speaker.current!.stop()
  }

  const reset = () => {
    stop()
    resetAlfred(session)
    session = crypto.randomUUID()
    setMessages([])
    setError(null)
    input.current?.focus()
  }

  const working = busy || phase === 'speaking'
  const status =
    phase === 'listening'
      ? { live: true, label: 'Listening', tone: 'red' as const }
      : phase === 'speaking'
        ? { live: true, label: 'Speaking', tone: 'gold' as const }
        : busy
          ? { live: true, label: voiceOn ? 'Thinking' : 'Plotting', tone: 'gold' as const }
          : { live: false, label: voiceOn ? 'On the line' : 'Ready' }

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
      bodyRef={log}
      bodyClassName="gap-4"
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-black/30 p-1.5 pl-3.5 transition-colors focus-within:border-gold/50">
            <textarea
              ref={input}
              value={draft}
              rows={1}
              placeholder={phase === 'listening' ? 'Listening… tap the mic again to send' : voiceOn ? 'Talk or type to Alfred…' : 'Ask the mastermind…'}
              aria-label="Message HeistAI"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
              className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-paper outline-none [field-sizing:content] placeholder:text-mute/60 focus-visible:outline-none"
            />
            <AnimatePresence mode="popLayout" initial={false}>
              {phase === 'listening' ? (
                <motion.button
                  key="listening"
                  type="button"
                  onClick={toggleMic}
                  aria-label="Stop recording and send"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  whileTap={{ scale: 0.92 }}
                  className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-laser text-white shadow-[0_6px_18px_-6px_rgba(255,61,74,0.8)]"
                >
                  <span className="absolute inset-0 animate-ping rounded-xl bg-laser/40" />
                  <Mic className="relative size-4" strokeWidth={2.25} />
                </motion.button>
              ) : working ? (
                <motion.button
                  key="stop"
                  type="button"
                  onClick={stop}
                  aria-label="Stop"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-paper transition-colors hover:bg-white/10"
                >
                  <Square className="size-3.5 fill-current" />
                </motion.button>
              ) : voiceOn && !draft.trim() ? (
                <motion.button
                  key="mic"
                  type="button"
                  onClick={toggleMic}
                  aria-label="Talk to Alfred"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  whileTap={{ scale: 0.92 }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#f3d493] to-gold text-ink shadow-[0_6px_18px_-6px_rgba(227,181,99,0.8)] transition-[filter] hover:brightness-105"
                >
                  <Mic className="size-4" strokeWidth={2.25} />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: draft.trim() ? 1 : 0.3 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  whileTap={{ scale: 0.92 }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#f3d493] to-gold text-ink shadow-[0_6px_18px_-6px_rgba(227,181,99,0.8)] transition-[opacity,filter] hover:brightness-105 disabled:shadow-none"
                >
                  <ArrowUp className="size-4" strokeWidth={2.25} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="flex h-6 items-center justify-between px-1 text-[11px] text-mute">
            <span>
              {voiceOn ? (
                <>
                  Tap <Mic className="mb-px inline size-3 text-gold" /> to talk, or type and press <kbd className="font-mono text-paper/60">Enter</kbd>
                </>
              ) : voice === 'loading' ? (
                'Alfred is warming up his voice…'
              ) : voice === 'offline' ? (
                <>
                  Text only. Run <kbd className="font-mono text-paper/60">npm run heistai</kbd> to talk to Alfred
                </>
              ) : (
                <>
                  <kbd className="font-mono text-paper/60">Enter</kbd> to send, <kbd className="font-mono text-paper/60">Shift+Enter</kbd> for a new line
                </>
              )}
            </span>
            <AnimatePresence>
              {messages.length > 0 && !working && phase !== 'listening' && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  onClick={reset}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.05] hover:text-paper"
                >
                  <RotateCcw className="size-3" />
                  New plan
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>
      }
    >
      <div className="flex flex-col gap-4" aria-live="polite">
        {[voiceOn ? VOICE_GREETING : GREETING, ...messages].map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
      </div>

      <AnimatePresence>
        {messages.length === 0 && (
          <motion.div
            key="starters"
            className="mt-auto grid grid-cols-2 gap-2"
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
            variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.25 } } }}
          >
            {STARTERS.map(({ icon: Icon, text }) => (
              <motion.button
                key={text}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                whileTap={{ scale: 0.97 }}
                onClick={() => send(text)}
                className="group flex flex-col items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left text-[12.5px] leading-snug text-paper/80 transition-colors hover:border-gold/40 hover:bg-gold/[0.05] hover:text-paper"
              >
                <Icon className="size-4 text-mute transition-colors group-hover:text-gold" strokeWidth={1.75} />
                {text}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{error && <ErrorNote key="err">{error}</ErrorNote>}</AnimatePresence>
    </PanelShell>
  )
}
