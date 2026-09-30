export type ModuleId = 'voice' | 'faceswap' | 'heistai' | 'alibi' | 'fakeid' | 'slot6'

export type ModuleInfo = {
  id: ModuleId
  name: string
  tagline: string
  ready: boolean
}

/** Order here is the order of the slots in the suitcase (3 across, 2 deep). */
export const MODULES: ModuleInfo[] = [
  { id: 'voice', name: 'Voice Modulator', tagline: 'Disguise your voice in real time', ready: true },
  { id: 'faceswap', name: 'Face-Swap Lens', tagline: 'Wear someone else’s face on camera', ready: false },
  { id: 'heistai', name: 'HeistAI', tagline: 'Your crew’s AI mastermind', ready: false },
  { id: 'alibi', name: 'Alibi Generator', tagline: 'A watertight backstory, on demand', ready: false },
  { id: 'fakeid', name: 'ID Forge', tagline: 'Snap a photo, print a crew ID', ready: true },
  { id: 'slot6', name: 'Empty Slot', tagline: 'Sixth module to be decided', ready: false },
]
