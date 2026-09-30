import { useEffect, useRef, useState } from 'react'
import { streamHeistAI, type ChatMessage } from '../ai/heistApi'
import './aiPanels.css'

const STARTERS = [
  'Plan a museum heist for a crew of four',
  'Who do I need on my crew?',
  'We got spotted. What’s the escape plan?',
  'Which gadget in this case should I use first?',
]

const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'HeistAI online. Tell me the mark and I’ll draw up the plan. Or pick a starter below.',
}

// Kept at module level so the conversation survives closing and reopening the panel.
let savedChat: ChatMessage[] = []

export function HeistAIPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(savedChat)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    savedChat = messages
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages])

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
  }

  const shown = [GREETING, ...messages]

  return (
    <aside className="panel ai-panel" role="dialog" aria-label="HeistAI">
      <header>
        <div>
          <span className="kicker">Module 03</span>
          <h2>HeistAI</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="chat-log" ref={log} aria-live="polite">
        {shown.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || <span className="typing" aria-label="HeistAI is typing" />}
          </div>
        ))}
      </div>

      {messages.length === 0 && (
        <div className="starters">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <textarea
          value={draft}
          rows={2}
          placeholder="Ask the mastermind…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(draft)
            }
          }}
        />
        {busy ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
      {messages.length > 0 && !busy && (
        <button className="link" onClick={reset}>
          New plan
        </button>
      )}
    </aside>
  )
}
