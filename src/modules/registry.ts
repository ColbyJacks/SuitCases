export type ModuleId = 'voice' | 'faceswap' | 'heistai' | 'alibi' | 'fakeid' | 'slot6'

export type ModuleInfo = {
  id: ModuleId
  name: string
  code: string
  tagline: string
  ready: boolean
}

/** Order here is the order of the slots in the suitcase (3 across, back row first). */
export const MODULES: ModuleInfo[] = [
  { id: 'voice', name: 'Voice Modulator', code: 'VOX-7', tagline: 'Disguise your voice in real time', ready: true },
  { id: 'faceswap', name: 'Face-Swap Lens', code: 'LNS-2', tagline: 'Wear someone else’s face on camera', ready: true },
  { id: 'heistai', name: 'HeistAI', code: 'AI-9', tagline: 'Your crew’s AI mastermind', ready: true },
  { id: 'alibi', name: 'Alibi Generator', code: 'ALB-4', tagline: 'A watertight backstory, on demand', ready: true },
  { id: 'fakeid', name: 'ID Forge', code: 'ID-5', tagline: 'Snap a photo, print a crew ID', ready: true },
  { id: 'slot6', name: 'Empty Slot', code: '---', tagline: 'Sixth module to be decided', ready: false },
]

/** Slot number shown on panels ("Module 03"). */
export function moduleNumber(id: ModuleId) {
  return String(MODULES.findIndex((m) => m.id === id) + 1).padStart(2, '0')
}
