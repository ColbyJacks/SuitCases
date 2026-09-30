# Operation: Suitcase

A RowdyHacks heist-themed 3D web app. A dark room, a table, a single lamp, and an aluminum flight case. Click the case to open it and pick a tool.

Built with Vite, React, TypeScript, and React Three Fiber (`@react-three/fiber` + `@react-three/drei`). Every model is built from primitives, so there are no asset downloads.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The mic only works on `localhost` or HTTPS.

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
  scene/Scene.tsx              canvas, room, table, lamp + spotlight, camera controls
  scene/Suitcase.tsx           the case, hinged lid, latches, 3x2 module slots
  modules/registry.ts          module list (names, taglines, ready flag)
  modules/VoiceModulatorModule.tsx   3D bronze speaker
  modules/PlaceholderModules.tsx     stand-in props for unbuilt modules
  audio/voiceEngine.ts         Web Audio voice changer
  ui/VoiceModulatorPanel.tsx   floating control panel
```

### Adding a module

1. Set `ready: true` for it in `src/modules/registry.ts`.
2. Replace its case in `PlaceholderModules.tsx` with a real 3D component (or branch on it in `Suitcase.tsx` like `voice`).
3. Add a panel in `src/ui/` and render it in `App.tsx` when `active` matches its id.
