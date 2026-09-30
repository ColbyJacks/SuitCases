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
| 2 | Face-Swap Lens | Placeholder |
| 3 | HeistAI assistant | Working (needs API key) |
| 4 | Alibi Generator | Working (needs API key) |
| 5 | ID Forge | Placeholder |
| 6 | Empty slot | Undecided |

### Voice Modulator

Live mic processing with the Web Audio API, no server needed.

- Pitch shift runs in an AudioWorklet (`public/worklets/pitch-shifter.js`), a two-head delay-line shifter.
- Robot is a 50 Hz ring modulator, Radio is a band-pass squeeze, Grit is a tanh waveshaper, Echo is a feedback delay.
- Presets: Natural, Deep Boss, Chipmunk, Robot, Radio, Phantom. Sliders tweak everything.
- "Hear myself" routes the result to your speakers (use headphones). "Record clip" saves the disguised voice as a `.webm`.
- The speaker cone and LED in the 3D scene react to your voice level.

### HeistAI

A chat with an in-character heist mastermind. Replies stream in as they're written. Starter prompts help you get going, and the conversation survives closing the panel. It keeps things movie-plot fictional.

### Alibi Generator

Describe the job, where you want to have been, and who vouches for you (or leave it all blank), pick a style, and get a case-file cover story: timeline, witnesses, receipts, weak spots, and the one line to say when asked. Uses structured output so the result always has the same shape. "Copy alibi" puts it on your clipboard as text.

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
  ui/HeistAIPanel.tsx          streaming chat panel
  ui/AlibiPanel.tsx            alibi form + case-file result
  ui/aiPanels.css              styles for the two AI panels
  ai/heistApi.ts               browser calls to /api/heistai and /api/alibi
server/
  heistApi.ts                  Vite plugin: Claude endpoints (reads ANTHROPIC_API_KEY)
```

### Adding a module

1. Set `ready: true` for it in `src/modules/registry.ts`.
2. Replace its case in `PlaceholderModules.tsx` with a real 3D component (or branch on it in `Suitcase.tsx` like `voice`).
3. Add a panel in `src/ui/` and render it in `App.tsx` when `active` matches its id.
