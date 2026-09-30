import { useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { VoiceModulatorPanel } from './ui/VoiceModulatorPanel'
import { FakeIdPanel } from './ui/FakeIdPanel'
import type { ModuleId, ModuleInfo } from './modules/registry'

export default function App() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ModuleId | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActive(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectModule = (m: ModuleInfo) => {
    if (m.ready) setActive(m.id)
    else setToast(`${m.name}: offline, coming soon`)
  }

  return (
    <>
      <Scene
        open={open}
        onToggle={() => {
          setOpen((o) => !o)
          setActive(null)
        }}
        activeModule={active}
        onSelectModule={selectModule}
      />

      <div className="hud">
        <h1>Operation: Suitcase</h1>
        <p>{open ? 'Pick a tool from the case.' : 'Click the case to open it. Drag to look around.'}</p>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {active === 'voice' && <VoiceModulatorPanel onClose={() => setActive(null)} />}
      {active === 'fakeid' && <FakeIdPanel onClose={() => setActive(null)} />}
    </>
  )
}
