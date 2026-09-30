import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { ArrowUp, Bot, Briefcase, Landmark, RotateCcw, Siren, Square, Users, type LucideIcon } from 'lucide-react'
import { streamHeistAI, type ChatMessage } from '../ai/heistApi'
import { ErrorNote, PanelShell } from './PanelShell'

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

// Kept at module level so the conversation survives closing and reopening the panel.
let savedChat: ChatMessage[] = []

function Typing() {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="HeistAI is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-gold"
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
        {message.content || <Typing />}
      </div>
    </motion.div>
  )
}

export function HeistAIPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(savedChat)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    savedChat = messages
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, error])

  useEffect(() => () => abort.current?.abort(), [])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
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
      if (!ctrl.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
        // Drop the empty assistant bubble and put the question back in the box.
        setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -2)))
        setDraft(content)
      }
    } finally {
      setBusy(false)
    }
  }

  const stop = () => abort.current?.abort()

  const reset = () => {
    stop()
    setMessages([])
    setError(null)
    input.current?.focus()
  }

  return (
    <PanelShell
      id="heistai"
      title={
        <>
          Heist<em>AI</em>
        </>
      }
      status={busy ? { live: true, label: 'Plotting', tone: 'gold' } : { live: false, label: 'Ready' }}
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
              placeholder="Ask the mastermind…"
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
              {busy ? (
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
              <kbd className="font-mono text-paper/60">Enter</kbd> to send, <kbd className="font-mono text-paper/60">Shift+Enter</kbd> for a new line
            </span>
            <AnimatePresence>
              {messages.length > 0 && !busy && (
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
        {[GREETING, ...messages].map((m, i) => (
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
