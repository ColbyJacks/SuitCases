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
| 2 | Face-Swap Lens (camera lens) | Working |
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

### Face-Swap Lens

Live face swap in the browser, no server and no uploads.

- Click the lens, turn the camera on, then drop in (or pick) a photo with a clear, front-facing face.
- MediaPipe Face Landmarker tracks 468 points on your face each frame and finds the same 468 points on the photo once. The photo is then drawn onto your face as a textured mesh in WebGL2, so it follows your head, mouth, and expressions. Your real eyes and mouth show through the mesh's holes.
- The mesh's outer rings fade out for a soft edge, and "Skin match" shifts the photo's skin tone toward your camera's lighting.
- "Snapshot" saves a PNG and "Record" saves a `.webm` of the disguised feed. "Show tracking mesh" draws the wireframe for the demo.
- The tracker's WASM runtime is copied from `node_modules` into `public/mediapipe` by `npm run dev`/`build`, and the model ships in `public/models`, so it works offline.
- The lens in the 3D scene glows while the camera is live, and its LED turns green when it has locked onto a face.

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
  vision/faceSwapEngine.ts     face tracking + WebGL face warp
  modules/FaceSwapLensModule.tsx     3D camera lens
  ui/FaceSwapPanel.tsx         face swap panel
  ui/VoiceModulatorPanel.tsx   floating control panel
```

### Adding a module

1. Set `ready: true` for it in `src/modules/registry.ts`.
2. Replace its case in `PlaceholderModules.tsx` with a real 3D component (or branch on it in `Suitcase.tsx` like `voice`).
3. Add a panel in `src/ui/` and render it in `App.tsx` when `active` matches its id.
