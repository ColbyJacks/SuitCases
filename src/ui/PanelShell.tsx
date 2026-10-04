import { useId, type ReactNode, type Ref } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { X, type LucideIcon } from 'lucide-react'
import { MODULES, moduleNumber, type ModuleId } from '../modules/registry'
import { MODULE_ICONS } from './Dock'

type Status = { live: boolean; label: string; tone?: 'red' | 'green' | 'gold' }

const TONES = {
  red: { text: 'text-[#ff8a92]', dot: 'bg-laser' },
  green: { text: 'text-[#8cf5b4]', dot: 'bg-[#35e07a]' },
  gold: { text: 'text-gold', dot: 'bg-gold' },
}

/**
 * Glass panel every module opens into: slides in from the right on desktop,
 * rises as a bottom sheet on phones. Header shows the module's icon, number,
 * code, a status light and the title.
 */
export function PanelShell({
  id,
  title,
  status,
  onClose,
  wide = false,
  footer,
  bodyClassName,
  bodyRef,
  className,
  children,
}: {
  id: ModuleId
  title: ReactNode
  status: Status
  onClose: () => void
  wide?: boolean
  footer?: ReactNode
  bodyClassName?: string
  bodyRef?: Ref<HTMLDivElement>
  className?: string
  children: ReactNode
}) {
  const info = MODULES.find((m) => m.id === id)!
  const Icon = MODULE_ICONS[id]
  const tone = TONES[status.tone ?? 'red']
  return (
    <motion.aside
      role="dialog"
      aria-label={info.name}
      initial={{ x: 60, opacity: 0, filter: 'blur(12px)' }}
      animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
      exit={{ x: 60, opacity: 0, filter: 'blur(12px)' }}
      transition={{ type: 'spring', bounce: 0.18, duration: 0.7 }}
      className={clsx(
        'glow-border grain pointer-events-auto fixed inset-x-3 bottom-3 z-30 flex max-h-[64vh] flex-col rounded-3xl border border-white/[0.07] bg-ink-2/80 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:bottom-5 md:left-auto md:right-5 md:top-5 md:max-h-none',
        wide ? 'md:w-[420px]' : 'md:w-[390px]',
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b border-white/[0.06] p-5 pb-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f3d493] via-gold to-gold-dim text-ink shadow-[0_8px_24px_-6px_rgba(227,181,99,0.6)]">
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.22em] text-mute">
            Module {moduleNumber(id)} · {info.code}
            <span className={clsx('flex items-center gap-1.5 transition-colors', status.live ? tone.text : 'text-mute/70')}>
              <span className={clsx('size-1.5 rounded-full', status.live ? clsx('animate-pulse', tone.dot) : 'bg-white/25')} />
              {status.label}
            </span>
          </span>
          <h2 className="truncate font-display text-[27px] leading-none text-paper">{title}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-mute transition-colors hover:bg-white/[0.06] hover:text-paper"
        >
          <X className="size-4" />
        </button>
      </header>

      <div ref={bodyRef} className={clsx('flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 [scrollbar-width:thin]', bodyClassName)}>
        {children}
      </div>
      {footer && <div className="border-t border-white/[0.06] p-4">{footer}</div>}
    </motion.aside>
  )
}

export function Section({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
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

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <label htmlFor={id} className="grid grid-cols-[76px_1fr_52px] items-center gap-3 text-[13px]">
      <span className="text-paper/75">{label}</span>
      <input
        id={id}
        type="range"
        className="slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="text-right font-mono text-xs tabular-nums text-gold/90">{format(value)}</output>
    </label>
  )
}

export function Toggle({
  label,
  hint,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  icon?: LucideIcon
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-white/10"
    >
      <span className="flex min-w-0 items-center gap-2.5 text-sm text-paper/85">
        {Icon && <Icon className="size-4 shrink-0 text-mute" />}
        <span className="truncate">{label}</span>
        {hint && <span className="truncate text-xs text-mute">{hint}</span>}
      </span>
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-white/10 transition-colors peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-checked:[&>span]:translate-x-4">
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-paper shadow transition-transform" />
      </span>
    </label>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-gradient-to-b from-[#f3d493] to-gold text-ink shadow-[0_8px_24px_-8px_rgba(227,181,99,0.7)] hover:brightness-105',
  secondary: 'border-white/10 bg-white/[0.04] text-paper hover:border-white/20 hover:bg-white/[0.07]',
  danger: 'border-laser/50 bg-laser/15 text-[#ffb3b8] hover:bg-laser/20',
  ghost: 'border-transparent bg-transparent text-mute hover:bg-white/[0.05] hover:text-paper',
}

export function Button({
  variant = 'secondary',
  icon: Icon,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant
  icon?: LucideIcon
  children?: ReactNode
} & Omit<React.ComponentProps<typeof motion.button>, 'children'>) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={clsx(
        'flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-[background-color,border-color,filter,color] disabled:cursor-not-allowed disabled:opacity-40',
        BUTTON[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="size-4" strokeWidth={2} />}
      {children}
    </motion.button>
  )
}

/** Shared look for text inputs, textareas and selects. */
export const fieldClass =
  'w-full min-w-0 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-paper placeholder:text-mute/60 outline-none transition-colors focus:border-gold/60 focus:bg-black/40'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">{label}</span>
      {children}
    </label>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-xl border border-laser/30 bg-laser/10 px-3 py-2 text-xs leading-relaxed text-[#ffb3b8]"
    >
      {children}
    </motion.p>
  )
}

export function Note({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 text-center text-[11px] text-mute">
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {children}
    </p>
  )
}

/** Friendlier wording for camera/mic permission failures. */
export function deviceError(e: unknown, device: 'camera' | 'microphone') {
  const msg = e instanceof Error ? e.message : String(e)
  if (/denied|not allowed|permission/i.test(msg)) {
    return `${device === 'camera' ? 'Camera' : 'Microphone'} access was blocked. Allow the ${device} for this site in your browser, then try again.`
  }
  if (/not found|no .*device|requested device/i.test(msg)) return `No ${device} was found on this device.`
  return msg
}
