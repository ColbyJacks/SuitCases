import { useEffect, useRef, useState } from 'react'
import { alibiToText, generateAlibi, type Alibi, type AlibiRequest } from '../ai/heistApi'
import './aiPanels.css'

const STYLES = ['Airtight', 'Boring on purpose', 'Too wholesome', 'Chaotic']

const EXAMPLE: AlibiRequest = {
  crime: 'The Crown Jewel of San Antonio vanished from a gala at the art museum at 11:40 PM',
  whereabouts: 'A late-night taco run and karaoke on the River Walk',
  crew: 'My cousin Dani',
  style: 'Airtight',
}

let savedForm: AlibiRequest = { crime: '', whereabouts: '', crew: '', style: 'Airtight' }
let savedAlibi: Alibi | null = null

export function AlibiPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<AlibiRequest>(savedForm)
  const [alibi, setAlibi] = useState<Alibi | null>(savedAlibi)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => void (savedForm = form), [form])
  useEffect(() => void (savedAlibi = alibi), [alibi])
  useEffect(() => () => abort.current?.abort(), [])

  const set = (k: keyof AlibiRequest) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const generate = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      setAlibi(await generateAlibi(form, ctrl.signal))
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!alibi) return
    await navigator.clipboard.writeText(alibiToText(alibi))
    setCopied(true)
  }

  return (
    <aside className="panel ai-panel" role="dialog" aria-label="Alibi Generator">
      <header>
        <div>
          <span className="kicker">Module 04</span>
          <h2>Alibi Generator</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <form
        className="alibi-form"
        onKeyDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void generate()
        }}
      >
        <label>
          <span>The job</span>
          <textarea rows={2} value={form.crime} onChange={set('crime')} placeholder={EXAMPLE.crime} />
        </label>
        <label>
          <span>Where you “were”</span>
          <input value={form.whereabouts} onChange={set('whereabouts')} placeholder={EXAMPLE.whereabouts} />
        </label>
        <label>
          <span>Who vouches for you</span>
          <input value={form.crew} onChange={set('crew')} placeholder={EXAMPLE.crew} />
        </label>
        <div className="presets">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              className={form.style === s ? 'selected' : ''}
              onClick={() => setForm({ ...form, style: s })}
            >
              {s}
            </button>
          ))}
        </div>
        <button className={`big ${busy ? 'on' : ''}`} type="submit" disabled={busy}>
          {busy ? 'Getting the story straight…' : alibi ? '↻ New alibi' : '● Generate alibi'}
        </button>
        {!alibi && !busy && <p className="note">Leave fields blank and HeistAI will invent them.</p>}
      </form>

      {error && <p className="error">{error}</p>}

      {alibi && (
        <article className={`dossier ${busy ? 'stale' : ''}`}>
          <span className="kicker">Cover story</span>
          <h3>{alibi.codename}</h3>
          <p className="headline">{alibi.headline}</p>
          {alibi.story.split(/\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          <h4>Timeline</h4>
          <ol className="timeline">
            {alibi.timeline.map((t, i) => (
              <li key={i}>
                <time>{t.time}</time>
                <span>{t.event}</span>
              </li>
            ))}
          </ol>

          <h4>Witnesses</h4>
          <ul className="witnesses">
            {alibi.witnesses.map((w, i) => (
              <li key={i}>
                <strong>{w.name}</strong> <em>{w.role}</em>
                <q>{w.willSay}</q>
              </li>
            ))}
          </ul>

          <h4>Receipts</h4>
          <ul>
            {alibi.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>

          <h4>Weak spots</h4>
          <ul>
            {alibi.weakSpots.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>

          <div className="rehearse">
            <span className="kicker">When they ask where you were</span>
            <q>{alibi.rehearsalLine}</q>
          </div>

          <button onClick={copy}>{copied ? 'Copied' : 'Copy alibi'}</button>
        </article>
      )}
    </aside>
  )
}
