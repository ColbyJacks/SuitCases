import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Lock, MousePointerClick } from 'lucide-react'
import { Scene } from './scene/Scene'
import { VoiceModulatorPanel } from './ui/VoiceModulatorPanel'
import { ShaderTitle } from './ui/ShaderTitle'
import { Scramble } from './ui/Scramble'
import { Dock, MODULE_ICONS } from './ui/Dock'
import type { ModuleId, ModuleInfo } from './modules/registry'

export default function App() {
  const [fontsReady, setFontsReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ModuleId | null>(null)
  const [toast, setToast] = useState<ModuleInfo | null>(null)
  const [wide, setWide] = useState(() => window.innerWidth >= 768)

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Canvas textures (nameplate, blueprint, cash) draw text, so wait for the fonts.
  useEffect(() => {
    Promise.all([
      document.fonts.load('400 40px "Instrument Serif"'),
      document.fonts.load('italic 400 40px "Instrument Serif"'),
      document.fonts.load('600 20px "Geist Mono Variable"'),
      document.fonts.load('400 16px "Geist Variable"'),
    ])
      .catch(() => {})
      .then(() => setFontsReady(true))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setActive((a) => {
        if (a === null) setOpen(false)
        return null
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectModule = (m: ModuleInfo) => {
    setOpen(true)
    if (m.ready) setActive((a) => (a === m.id ? null : m.id))
    else setToast(m)
  }

  const ToastIcon = toast ? MODULE_ICONS[toast.id] : Lock

  return (
    <div className="relative h-full w-full">
      {fontsReady && (
        <Scene
          open={open}
          onToggle={() => {
            setOpen((o) => !o)
            setActive(null)
          }}
          activeModule={active}
          onSelectModule={selectModule}
        />
      )}

      {/* fade in from black */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-50 bg-ink"
        initial={{ opacity: 1 }}
        animate={{ opacity: fontsReady ? 0 : 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />

      {/* title, centred above the case */}
      <motion.header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-4 pt-[max(3.5vh,20px)]"
        animate={{
          y: active ? -14 : open ? -8 : 0,
          scale: active ? 0.78 : open ? 0.88 : 1,
          x: active && wide ? -200 : 0,
          opacity: active && !wide ? 0 : 1,
        }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.9 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.32em] text-mute sm:text-[11px]"
        >
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/60" />
          <span>RowdyHacks · Case file Nº 026</span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/60" />
        </motion.div>
        <ShaderTitle className="-mt-1 h-[clamp(64px,11vw,132px)] w-[min(94vw,980px)]" />
        <motion.div animate={{ opacity: open ? 0 : 1, y: open ? -6 : 0 }} transition={{ duration: 0.5 }}>
          <Scramble
            text="SIX TOOLS. ONE JOB. ZERO WITNESSES."
            delay={1700}
            className="-mt-1 font-mono text-[10px] tracking-[0.3em] text-paper/55 sm:text-xs"
          />
        </motion.div>
      </motion.header>

      {/* bottom: hint while closed, dock once open */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(3vh,16px)]">
        <AnimatePresence mode="wait">
          {!open ? (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16, filter: 'blur(6px)', transition: { duration: 0.25 } }}
              transition={{ delay: 2.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                onClick={() => setOpen(true)}
                className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-ink-2/60 py-2 pl-3 pr-4 backdrop-blur-xl transition-colors hover:border-gold/40"
              >
                <MousePointerClick className="size-4 text-gold" strokeWidth={1.75} />
                <motion.span
                  className="bg-[length:200%_100%] bg-gradient-to-r from-paper/50 via-paper to-paper/50 bg-clip-text text-sm text-transparent"
                  animate={{ backgroundPosition: ['200% center', '-200% center'] }}
                  transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
                >
                  Click the case to crack it open
                </motion.span>
              </button>
            </motion.div>
          ) : (
            <Dock key="dock" active={active} onSelect={selectModule} />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
            className="pointer-events-none absolute bottom-[calc(max(3vh,16px)+64px)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl border border-white/[0.08] bg-ink-2/85 py-2.5 pl-2.5 pr-4 shadow-2xl backdrop-blur-xl"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.06] text-mute">
              <ToastIcon className="size-4" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col">
              <span className="text-sm text-paper">{toast.name}</span>
              <span className="text-xs text-mute">{toast.id === 'slot6' ? 'This slot is still empty' : 'Offline. Coming soon.'}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{active === 'voice' && <VoiceModulatorPanel key="voice" onClose={() => setActive(null)} />}</AnimatePresence>
    </div>
  )
}
