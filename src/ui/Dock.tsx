import { AnimatePresence, motion } from 'motion/react'
import { Bot, FileText, IdCard, Mic, Radar, ScanFace, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { MODULES, type ModuleId, type ModuleInfo } from '../modules/registry'

export const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  voice: Mic,
  faceswap: ScanFace,
  heistai: Bot,
  alibi: FileText,
  fakeid: IdCard,
  watchtower: Radar,
}

const spring = { type: 'spring', bounce: 0, duration: 0.45 } as const

/** Bottom toolbar listing every module; the selected one expands to show its name. */
export function Dock({ active, onSelect }: { active: ModuleId | null; onSelect: (m: ModuleInfo) => void }) {
  return (
    <motion.nav
      initial={{ y: 40, opacity: 0, filter: 'blur(8px)' }}
      animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
      exit={{ y: 40, opacity: 0, filter: 'blur(8px)' }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.7, delay: 0.35 }}
      aria-label="Modules"
      className="glow-border grain pointer-events-auto relative flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-ink-2/75 p-1.5 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl"
    >
      {MODULES.map((m) => {
        const Icon = MODULE_ICONS[m.id]
        const selected = active === m.id
        return (
          <motion.button
            key={m.id}
            layout
            transition={spring}
            onClick={() => onSelect(m)}
            aria-pressed={selected}
            title={m.ready ? m.name : `${m.name} (coming soon)`}
            className={clsx(
              'relative flex h-10 items-center rounded-xl px-3 text-sm outline-none transition-colors',
              selected ? 'text-ink' : m.ready ? 'text-paper/85 hover:text-paper' : 'text-mute/70 hover:text-paper/80',
            )}
          >
            {selected && (
              <motion.span
                layoutId="dock-pill"
                transition={spring}
                className="absolute inset-0 rounded-xl bg-gradient-to-b from-[#f3d493] to-gold shadow-[0_0_24px_-4px_rgba(227,181,99,0.7)]"
              />
            )}
            {!selected && (
              <span className="absolute inset-0 rounded-xl bg-white/0 transition-colors hover:bg-white/[0.06]" />
            )}
            <motion.span layout="position" className="relative flex items-center gap-2">
              <Icon className="size-[18px]" strokeWidth={1.75} />
              <AnimatePresence initial={false}>
                {selected && (
                  <motion.span
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={spring}
                    className="overflow-hidden whitespace-nowrap font-medium"
                  >
                    {m.name}
                  </motion.span>
                )}
              </AnimatePresence>
              {!m.ready && !selected && <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-white/20" />}
            </motion.span>
          </motion.button>
        )
      })}
    </motion.nav>
  )
}
