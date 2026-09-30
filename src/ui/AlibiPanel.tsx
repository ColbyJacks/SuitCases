import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { AlertTriangle, Check, Coffee, Copy, Heart, Receipt, ShieldCheck, Sparkles, Zap, type LucideIcon } from 'lucide-react'
import { alibiToText, generateAlibi, type Alibi, type AlibiRequest } from '../ai/heistApi'
import { Button, ErrorNote, Field, Note, PanelShell, Section, fieldClass } from './PanelShell'

const STYLES: { name: string; icon: LucideIcon }[] = [
  { name: 'Airtight', icon: ShieldCheck },
  { name: 'Boring on purpose', icon: Coffee },
  { name: 'Too wholesome', icon: Heart },
  { name: 'Chaotic', icon: Zap },
]

const EXAMPLE: AlibiRequest = {
  crime: 'The Crown Jewel of San Antonio vanished from a gala at the art museum at 11:40 PM',
  whereabouts: 'A late-night taco run and karaoke on the River Walk',
  crew: 'My cousin Dani',
  style: 'Airtight',
}

let savedForm: AlibiRequest = { crime: '', whereabouts: '', crew: '', style: 'Airtight' }
let savedAlibi: Alibi | null = null

function DossierHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-1 border-b border-dashed border-[#b9a987] pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.28em] text-[#8a7a5c]">
      {children}
    </h4>
  )
}

function Dossier({ alibi, stale }: { alibi: Alibi; stale: boolean }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24, rotate: -1.5 }}
      animate={{ opacity: stale ? 0.45 : 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.8 }}
      className="relative flex flex-col gap-3 rounded-xl bg-[#efe6d2] p-5 pt-6 font-mono text-[12px] leading-relaxed text-[#2b2419] shadow-[inset_0_0_60px_rgba(120,90,40,0.28),0_24px_48px_-20px_rgba(0,0,0,0.9)]"
    >
      {/* folder tab + stamp */}
      <span className="absolute -top-2.5 left-5 rounded-t-md bg-[#e4d8bd] px-3 pt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a7a5c]">
        Case file
      </span>
      <motion.span
        initial={{ scale: 1.8, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 0.85, rotate: -9 }}
        transition={{ delay: 0.45, type: 'spring', bounce: 0.45, duration: 0.5 }}
        className="absolute right-4 top-4 rounded border-2 border-[#a3261a] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#a3261a]"
      >
        Verified
      </motion.span>

      <div className="flex flex-col gap-1 pr-20">
        <span className="text-[9.5px] uppercase tracking-[0.28em] text-[#8a7a5c]">Cover story</span>
        <h3 className="font-display text-[30px] leading-none text-[#7a1f14]">{alibi.codename}</h3>
      </div>
      <p className="font-sans text-[13px] font-semibold leading-snug">{alibi.headline}</p>
      {alibi.story.split(/\n+/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <DossierHeading>Timeline</DossierHeading>
      <ol className="relative flex flex-col gap-2.5 pl-4 before:absolute before:bottom-1 before:left-[3px] before:top-1.5 before:w-px before:bg-[#b9a987]">
        {alibi.timeline.map((t, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-4 top-1.5 size-[7px] rounded-full border border-[#7a1f14] bg-[#efe6d2]" />
            <time className="mr-2 font-semibold text-[#7a1f14]">{t.time}</time>
            <span>{t.event}</span>
          </li>
        ))}
      </ol>

      <DossierHeading>Witnesses</DossierHeading>
      <ul className="flex flex-col gap-2">
        {alibi.witnesses.map((w, i) => (
          <li key={i} className="rounded-lg border border-[#d6c9a9] bg-[#f6efdf] px-3 py-2">
            <span className="font-semibold">{w.name}</span> <span className="text-[11px] text-[#8a7a5c]">{w.role}</span>
            <q className="mt-0.5 block italic">{w.willSay}</q>
          </li>
        ))}
      </ul>

      <DossierHeading>Receipts</DossierHeading>
      <ul className="flex flex-col gap-1.5">
        {alibi.evidence.map((e, i) => (
          <li key={i} className="flex gap-2">
            <Receipt className="mt-0.5 size-3.5 shrink-0 text-[#8a7a5c]" />
            {e}
          </li>
        ))}
      </ul>

      <DossierHeading>Weak spots</DossierHeading>
      <ul className="flex flex-col gap-1.5">
        {alibi.weakSpots.map((w, i) => (
          <li key={i} className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#a3261a]" />
            {w}
          </li>
        ))}
      </ul>

      <div className="mt-2 rounded-lg border-2 border-[#7a1f14] p-3">
        <span className="text-[9.5px] uppercase tracking-[0.24em] text-[#8a7a5c]">When they ask where you were</span>
        <q className="mt-1 block font-display text-[19px] leading-snug text-[#2b2419]">{alibi.rehearsalLine}</q>
      </div>
    </motion.article>
  )
}

export function AlibiPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<AlibiRequest>(savedForm)
  const [alibi, setAlibi] = useState<Alibi | null>(savedAlibi)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const result = useRef<HTMLDivElement>(null)

  useEffect(() => void (savedForm = form), [form])
  useEffect(() => void (savedAlibi = alibi), [alibi])
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])

  const set = (k: keyof AlibiRequest) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const generate = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      setAlibi(await generateAlibi(form, ctrl.signal))
      // bring the new case file into view
      requestAnimationFrame(() => {
        const b = body.current
        const r = result.current
        if (b && r) b.scrollTo({ top: b.scrollTop + r.getBoundingClientRect().top - b.getBoundingClientRect().top - 12, behavior: 'smooth' })
      })
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
    <PanelShell
      id="alibi"
      wide
      title={
        <>
          Alibi <em>Generator</em>
        </>
      }
      status={busy ? { live: true, label: 'Writing', tone: 'gold' } : alibi ? { live: true, label: 'Story set', tone: 'green' } : { live: false, label: 'Blank' }}
      onClose={onClose}
      bodyRef={body}
    >
      <form
        className="flex flex-col gap-3"
        onKeyDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void generate()
        }}
      >
        <Field label="The job">
          <textarea rows={2} className={clsx(fieldClass, 'resize-none')} value={form.crime} onChange={set('crime')} placeholder={EXAMPLE.crime} />
        </Field>
        <Field label="Where you “were”">
          <input className={fieldClass} value={form.whereabouts} onChange={set('whereabouts')} placeholder={EXAMPLE.whereabouts} />
        </Field>
        <Field label="Who vouches for you">
          <input className={fieldClass} value={form.crew} onChange={set('crew')} placeholder={EXAMPLE.crew} />
        </Field>

        <div className="mt-2 flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">Style</span>
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map(({ name, icon: Icon }) => {
              const selected = form.style === name
              return (
                <motion.button
                  key={name}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  aria-pressed={selected}
                  onClick={() => setForm({ ...form, style: name })}
                  className={clsx(
                    'relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors',
                    selected ? 'border-transparent text-paper' : 'border-white/[0.06] text-paper/75 hover:border-white/15 hover:bg-white/[0.03]',
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="alibi-style"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      className="absolute inset-0 rounded-xl border border-gold/50 bg-gradient-to-b from-gold/[0.16] to-gold/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_-8px_rgba(227,181,99,0.6)]"
                    />
                  )}
                  <Icon className={clsx('relative size-4 shrink-0', selected ? 'text-gold' : 'text-mute')} strokeWidth={1.75} />
                  <span className="relative truncate font-medium">{name}</span>
                </motion.button>
              )
            })}
          </div>
        </div>

        <Button variant="primary" type="submit" disabled={busy} icon={Sparkles} className={clsx('mt-2', busy && '[&>svg]:animate-pulse')}>
          {busy ? (
            <motion.span
              className="bg-[length:200%_100%] bg-gradient-to-r from-ink/50 via-ink to-ink/50 bg-clip-text text-transparent"
              animate={{ backgroundPosition: ['200% center', '-200% center'] }}
              transition={{ duration: 2, ease: 'linear', repeat: Infinity }}
            >
              Getting the story straight…
            </motion.span>
          ) : alibi ? (
            'New alibi'
          ) : (
            'Generate alibi'
          )}
        </Button>
        {!alibi && !busy && <Note>Leave fields blank and HeistAI will invent them.</Note>}
      </form>

      <AnimatePresence>{error && <ErrorNote key="err">{error}</ErrorNote>}</AnimatePresence>

      {alibi && (
        <div ref={result}>
          <Section
            label="Your story"
            aside={
              <button
                onClick={copy}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-mute transition-colors hover:bg-white/[0.06] hover:text-paper"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copied ? 'y' : 'n'}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {copied ? <Check className="size-3.5 text-[#8cf5b4]" /> : <Copy className="size-3.5" />}
                  </motion.span>
                </AnimatePresence>
                {copied ? 'Copied' : 'Copy alibi'}
              </button>
            }
          >
            <Dossier key={alibi.codename + alibi.headline} alibi={alibi} stale={busy} />
          </Section>
        </div>
      )}
    </PanelShell>
  )
}
