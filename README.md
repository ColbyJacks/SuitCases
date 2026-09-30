# Operation: Suitcase

A RowdyHacks heist-themed 3D web app. A dark room, a table, a single lamp, and an aluminum flight case. Click the case to open it and pick a tool.

Built with Vite, React, TypeScript, React Three Fiber (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`), Tailwind CSS v4, Motion (`motion/react`) and Lucide icons. Every model and texture is generated in code, so there are no asset downloads. Fonts (Instrument Serif, Geist, Geist Mono) are bundled from Fontsource.

Design notes:

- The title is a WebGL shader (`src/ui/ShaderTitle.tsx`): liquid-gold noise bands, a travelling highlight, a cursor light and a noisy reveal, in the style of unicorn.studio effects.
- UI transitions use Motion springs and shared-layout highlights (the dock pill, preset cards, style and role chips). The dock and module panels follow kokonut UI patterns (Toolbar, AI Voice, AI Input, Shimmer Text). Every module panel shares one glass frame and set of controls (`src/ui/PanelShell.tsx`).
- In 3D, the lid, latches, combination dials and modules run on small damped springs (`src/lib/spring.ts`), and the camera glides between shots with drei `CameraControls`.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The mic only works on `localhost` or HTTPS.

Add `?capture` to the URL to skip UI transitions (handy for screenshots on slow machines).

### Claude API key (HeistAI and Alibi Generator)

The two AI modules call Claude through a small endpoint inside the Vite server, so your key never reaches the browser.

1. Copy `.env.example` to `.env.local` in the project root (it's gitignored).
2. Paste your key from https://platform.claude.com/settings/keys after `ANTHROPIC_API_KEY=`.
3. Restart `npm run dev`.

The endpoints run in `npm run dev` and `npm run preview`. A plain static host (GitHub Pages, a bare `dist/` upload) won't have them; the rest of the app still works there.

`npm run build` produces a static site in `dist/` you can deploy anywhere (Vercel, Netlify, GitHub Pages).

## Modules

| Slot | Module | Status |
| --- | --- | --- |
| 1 | Voice Modulator (bronze speaker) | Working |
| 2 | Face-Swap Lens (camera lens) | Working |
| 3 | HeistAI assistant | Working (needs API key) |
| 4 | Alibi Generator | Working (needs API key) |
| 5 | ID Forge | Working |
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

### HeistAI

A chat with an in-character heist mastermind. Replies stream in as they're written. Starter prompts help you get going, and the conversation survives closing the panel. It keeps things movie-plot fictional.

### Alibi Generator

Describe the job, where you want to have been, and who vouches for you (or leave it all blank), pick a style, and get a case-file cover story: timeline, witnesses, receipts, weak spots, and the one line to say when asked. Uses structured output so the result always has the same shape. "Copy alibi" puts it on your clipboard as text.

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
  modules/PlaceholderModules.tsx     3D props for HeistAI (orb) and Alibi (notebook)
  audio/voiceEngine.ts         Web Audio voice changer
  ui/VoiceModulatorPanel.tsx   voice control panel
  ui/PanelShell.tsx            shared glass panel frame + form controls for every module
  ui/ShaderTitle.tsx           WebGL title effect
  ui/Dock.tsx                  bottom module toolbar
  ui/Scramble.tsx              decrypting subtitle text
  vision/faceSwapEngine.ts     face tracking + WebGL face warp
  modules/FaceSwapLensModule.tsx     3D camera lens
  ui/FaceSwapPanel.tsx         face swap panel
  ui/HeistAIPanel.tsx          streaming chat panel
  ui/AlibiPanel.tsx            alibi form + case-file result
  ai/heistApi.ts               browser calls to /api/heistai and /api/alibi
  idcard/                      ID Forge: card template, renderer, camera helpers, last-card store
  modules/FakeIdModule.tsx     3D crew ID on a card tray
  ui/FakeIdPanel.tsx           ID Forge panel (camera, countdown, fields, download)
server/
  heistApi.ts                  Vite plugin: Claude endpoints (reads ANTHROPIC_API_KEY)
```

### Adding a module

1. Set `ready: true` for it in `src/modules/registry.ts`.
2. Replace its case in `PlaceholderModules.tsx` with a real 3D component (or branch on it in `Suitcase.tsx` like `voice`).
3. Add a panel in `src/ui/` built on `PanelShell` and render it in `App.tsx` when `active` matches its id.
