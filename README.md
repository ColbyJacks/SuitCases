# Operation: Suitcase

A RowdyHacks heist-themed 3D web app. A dark room, a table, a single lamp, and an aluminum flight case. Click the case to open it and pick a tool.

Built with Vite, React, TypeScript, React Three Fiber (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`), Tailwind CSS v4, Motion (`motion/react`) and Lucide icons. Every model and texture is generated in code, so there are no asset downloads. Fonts (Instrument Serif, Geist, Geist Mono) are bundled from Fontsource.

Design notes:

- The title is a WebGL shader (`src/ui/ShaderTitle.tsx`): liquid-gold noise bands, a travelling highlight, a cursor light and a noisy reveal, in the style of unicorn.studio effects.
- UI transitions use Motion springs and shared-layout highlights (the dock pill and preset cards). The dock and voice controls follow kokonut UI patterns (Toolbar, AI Voice, Shimmer Text).
- In 3D, the lid, latches, combination dials and modules run on small damped springs (`src/lib/spring.ts`), and the camera glides between shots with drei `CameraControls`.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The mic only works on `localhost` or HTTPS.

Add `?capture` to the URL to skip UI transitions (handy for screenshots on slow machines).

`npm run build` produces a static site in `dist/` you can deploy anywhere (Vercel, Netlify, GitHub Pages).

## Modules

| Slot | Module | Status |
| --- | --- | --- |
| 1 | Voice Modulator (bronze speaker) | Working |
| 2 | Face-Swap Lens | Placeholder |
| 3 | HeistAI assistant | Placeholder |
| 4 | Alibi Generator | Placeholder |
| 5 | ID Forge | Placeholder |
| 6 | Empty slot | Undecided |

### Voice Modulator

Live mic processing with the Web Audio API, no server needed.

- Pitch shift runs in an AudioWorklet (`public/worklets/pitch-shifter.js`), a two-head delay-line shifter.
- Robot is a 50 Hz ring modulator, Radio is a band-pass squeeze, Grit is a tanh waveshaper, Echo is a feedback delay.
- Presets: Natural, Deep Boss, Chipmunk, Robot, Radio, Phantom. Sliders tweak everything.
- "Hear myself" routes the result to your speakers (use headphones). "Record clip" saves the disguised voice as a `.webm`.
- The speaker cone and LED in the 3D scene react to your voice level.

## Code map

```
src/
  App.tsx                      open/close state, active module, overlay panels
  scene/Scene.tsx              canvas, room, table, loot, lamp, camera shots, post-processing
  scene/Suitcase.tsx           the case: rounded shell, lid spring, latches, dials, foam cut-outs
  scene/textures.ts            procedural canvas textures (brushed metal, walnut, blueprint, cash)
  lib/spring.ts                damped spring used by the 3D animations
  modules/registry.ts          module list (names, taglines, ready flag)
  modules/VoiceModulatorModule.tsx   3D bronze speaker
  modules/PlaceholderModules.tsx     stand-in props for unbuilt modules
  audio/voiceEngine.ts         Web Audio voice changer
  ui/VoiceModulatorPanel.tsx   voice control panel
  ui/ShaderTitle.tsx           WebGL title effect
  ui/Dock.tsx                  bottom module toolbar
  ui/Scramble.tsx              decrypting subtitle text
```

### Adding a module

1. Set `ready: true` for it in `src/modules/registry.ts`.
2. Replace its case in `PlaceholderModules.tsx` with a real 3D component (or branch on it in `Suitcase.tsx` like `voice`).
3. Add a panel in `src/ui/` and render it in `App.tsx` when `active` matches its id.
