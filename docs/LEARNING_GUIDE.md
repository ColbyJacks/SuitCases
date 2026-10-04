# Operation: Suitcase, the learning guide

This guide is for whoever is presenting the project. It explains every tool, technology and technique the app uses, points at the exact files where each one lives, and links videos and docs for going deeper. The app never imports this file; it is only here to read.

How to use it:

- **Short on time?** Read [The 60-second pitch](#1-the-60-second-pitch), [The architecture in one picture](#2-the-architecture-in-one-picture) and [Questions judges will probably ask](#12-questions-judges-will-probably-ask).
- **Have an evening?** Read it top to bottom, then open each file it names and match the explanation to the code.
- **Want to really own it?** Work through the "Learn more" links at the end of each section and the [study plan](#15-a-study-plan) at the bottom.

Contents:

1. [The 60-second pitch](#1-the-60-second-pitch)
2. [The architecture in one picture](#2-the-architecture-in-one-picture)
3. [The toolchain: Node, npm, Vite, TypeScript, oxlint](#3-the-toolchain)
4. [React: the parts this app relies on](#4-react-the-parts-this-app-relies-on)
5. [The 3D scene: Three.js and React Three Fiber](#5-the-3d-scene-threejs-and-react-three-fiber)
6. [Animation: springs, Motion and the choreography](#6-animation-springs-motion-and-the-choreography)
7. [Styling: Tailwind v4, glass panels and the shader title](#7-styling-tailwind-v4-glass-panels-and-the-shader-title)
8. [Module 1: Voice Modulator (Web Audio API)](#8-module-1-voice-modulator)
9. [Module 2: Face-Swap Lens (MediaPipe + WebGL2)](#9-module-2-face-swap-lens)
10. [Modules 3 and 4: HeistAI and the Alibi Generator (Claude API)](#10-modules-3-and-4-heistai-and-the-alibi-generator)
11. [Module 5: ID Forge (camera + Canvas 2D)](#11-module-5-id-forge)
12. [Questions judges will probably ask](#12-questions-judges-will-probably-ask)
13. [Demo-day checklist](#13-demo-day-checklist)
14. [Glossary](#14-glossary)
15. [A study plan](#15-a-study-plan)
16. [All links in one place](#16-all-links-in-one-place)

---

## 1. The 60-second pitch

> "Operation: Suitcase is a heist toolkit that lives in a 3D briefcase in your browser. You walk into a dark room, a lamp lights a flight case on a table, you click it, the latches pop, the combination dials spin, the lid swings open and five gadgets rise out of the foam. Each one really works. The **Voice Modulator** disguises your voice live through your mic. The **Face-Swap Lens** puts someone else's face on yours through your webcam, tracked every frame. **HeistAI** is an in-character AI mastermind that helps you plan a movie-style caper. The **Alibi Generator** writes you a full case-file cover story. **ID Forge** snaps your photo and prints a novelty crew ID. Everything except the two AI modules runs entirely in your browser: no uploads, no server, and it works offline. Every 3D model and texture is generated in code, so there isn't a single downloaded model or image in the scene."

Three things worth stressing because they impress technical judges:

1. **Real-time processing on the user's device.** Audio DSP (digital signal processing) in an AudioWorklet, face tracking with an on-device ML model, and custom WebGL shaders. None of that is a canned video.
2. **Procedural everything.** The suitcase, table, cash, gold bars, blueprint, dial numbers and wood grain are all built from code (geometry math and Canvas-drawn textures).
3. **The API key is kept safe.** The AI modules call Claude from a small server endpoint, so the secret key never reaches the browser.

---

## 2. The architecture in one picture

```
Browser (everything the user sees)
├── React app (src/App.tsx)  ← holds "is the case open?" and "which module is active?"
│   ├── 3D canvas: React Three Fiber (src/scene/Scene.tsx, Suitcase.tsx)
│   │     room, table, loot, lamp, camera moves, post-processing
│   │     suitcase → six ModuleSlots → each shows a 3D prop (speaker, lens, orb, notebook, ID card)
│   ├── 2D overlay UI: title (WebGL shader), dock, toast, module panels (Motion + Tailwind)
│   └── Engines (plain TypeScript classes, no React):
│         voiceEngine     src/audio/voiceEngine.ts      Web Audio graph + AudioWorklet
│         faceSwapEngine  src/vision/faceSwapEngine.ts  MediaPipe + WebGL2
│         idcard/*        src/idcard/                    Canvas 2D card renderer
│         ai/heistApi.ts  src/ai/heistApi.ts             fetch() to /api/*
│
Vite dev server (your laptop, Node.js)
└── server/heistApi.ts  (a Vite plugin)
      POST /api/heistai → Claude, streamed text back
      POST /api/alibi   → Claude, JSON matching a schema
      reads ANTHROPIC_API_KEY from .env.local
```

The key design idea: **React owns "what state are we in", engines own "the fast stuff".** Anything that has to run 60 times a second (audio samples, video frames, 3D animation) lives outside React's render cycle, in engine classes or in `useFrame` callbacks. React only re-renders when something the user can see as a UI change happens (a panel opens, a button toggles). This is why the app stays smooth.

How a click flows through the app:

1. You click the case. The mesh's `onClick` in `Suitcase.tsx` calls `onToggle()`.
2. `App.tsx` flips `open` to `true`. The title fades out, the hint is swapped for the dock.
3. `Suitcase.tsx` sees `open` change. Its `useFrame` loop starts the choreography: latches pop, dials spin, then the lid swings on its spring, then each module slot rises in turn.
4. `CameraRig` in `Scene.tsx` glides the camera to the "open" shot.
5. You click the bronze speaker. `ModuleSlot` calls `onSelect(info)`, `App.tsx` sets `active = 'voice'`, and `<VoiceModulatorPanel>` slides in. The camera moves to the "focus" shot.

Adding a module is a four-step recipe (also in the README): flip `ready` in `src/modules/registry.ts`, add a 3D prop, add a panel built on `PanelShell`, render it in `App.tsx`.

---

## 3. The toolchain

### Node.js and npm

**Node.js** runs JavaScript outside the browser. Here it runs the dev server, the build and the small Claude endpoints. **npm** installs the libraries listed in `package.json` into `node_modules/` and runs the scripts:

| Command | What it does |
| --- | --- |
| `npm install` | Downloads every dependency in `package.json` (exact versions are pinned in `package-lock.json`). |
| `npm run dev` | First runs `predev` (copies MediaPipe's WASM files into `public/mediapipe`), then starts Vite's dev server with hot reload. |
| `npm run build` | Runs `prebuild`, type-checks with `tsc -b`, then bundles everything into `dist/`. |
| `npm run preview` | Serves the built `dist/` locally, with the AI endpoints still attached. |
| `npm run lint` | Runs oxlint, a very fast linter. |

`pre<name>` scripts run automatically before `<name>`. That's an npm convention, and it's how the MediaPipe copy happens without anyone remembering to do it.

### Vite

**Vite** (French for "fast") is the build tool and dev server. In development it serves your source files straight to the browser as native ES modules and only transforms the file you changed, so edits show up almost instantly (Hot Module Replacement, HMR). For production it bundles and minifies everything.

What to know about this project's `vite.config.ts`:

- `plugins: [react(), tailwindcss(), heistApiPlugin()]`. The React plugin handles JSX and fast refresh, the Tailwind plugin generates CSS, and `heistApiPlugin` is **our own plugin** that adds the Claude endpoints to Vite's server (section 10).
- `SINGLE_FILE=1` mode inlines every asset into one HTML file. That's how the shareable preview was built.
- Anything in `public/` is served as-is at the site root. That's why the worklet (`/worklets/pitch-shifter.js`) and the face model (`/models/face_landmarker.task`) live there.
- `import.meta.env.BASE_URL` is a Vite variable for the site's base path, used so file URLs work in both normal and single-file builds.

### TypeScript

**TypeScript** is JavaScript plus types. The browser never sees it; Vite strips the types, and `tsc -b` checks them during `npm run build`. Examples worth pointing at:

- `ModuleId = 'voice' | 'faceswap' | ...` in `registry.ts` is a *union of string literals*, so a typo like `'voise'` is a compile error.
- `VoiceParams` and `FaceSwapParams` describe exactly which knobs each engine has.
- `Alibi` in `src/ai/heistApi.ts` mirrors the JSON schema the server asks Claude for, so the panel code knows every field that comes back.

### oxlint

A linter written in Rust that catches common mistakes (unused variables, suspicious comparisons). Config is in `.oxlintrc.json`.

### Libraries at a glance (from `package.json`)

| Library | Role in this app |
| --- | --- |
| `react`, `react-dom` (v19) | UI components and state |
| `three` (v0.186) | The 3D engine underneath everything |
| `@react-three/fiber` (v9) | Lets you write Three.js scenes as React components |
| `@react-three/drei` (v10) | Ready-made R3F helpers: `CameraControls`, `SpotLight`, `RoundedBox`, `Environment`, `MeshReflectorMaterial`, `Sparkles`, `Html`, `useCursor` |
| `@react-three/postprocessing`, `postprocessing` | Bloom, vignette, film grain, chromatic aberration, tone mapping |
| `motion` (`motion/react`) | UI animation: springs, enter/exit, shared layout |
| `tailwindcss` (v4) | Utility-class CSS |
| `lucide-react` | Icons (mic, bot, ID card, and so on) |
| `clsx` | Joins class names conditionally |
| `@mediapipe/tasks-vision` | Google's on-device face landmark model |
| `@anthropic-ai/sdk` | Official Claude API client, used only on the server side |
| `@fontsource/*` | Self-hosted fonts (Instrument Serif, Geist, Geist Mono), so there are no Google Fonts calls |

**Learn more**

- [Vite in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=KCrXgy8qtjM)
- [TypeScript in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=zQnBQ4tB3ZA)
- Vite guide: https://vite.dev/guide/
- Vite plugin API (how `heistApiPlugin` hooks in): https://vite.dev/guide/api-plugin
- TypeScript handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- npm scripts, including `pre`/`post` hooks: https://docs.npmjs.com/cli/using-npm/scripts

---

## 4. React: the parts this app relies on

**React** builds UIs out of components: functions that return what should be on screen given some state. When state changes, React re-runs the component and updates only what changed.

The hooks used everywhere in this codebase:

| Hook | What it's for | Example in this repo |
| --- | --- | --- |
| `useState` | A value that should re-render the UI when it changes | `open`, `active`, `toast` in `App.tsx` |
| `useEffect` | Run side effects after render: subscribe, start timers, add listeners, and clean them up | The Escape-key listener in `App.tsx`; the countdown timer in `FakeIdPanel.tsx`; releasing the camera when the ID panel closes |
| `useRef` | A mutable box that survives re-renders *without* causing one | Spring objects, Three.js mesh refs, `AbortController`s |
| `useMemo` | Compute something expensive once and reuse it | Geometry and materials in `Suitcase.tsx`, procedural textures in `Scene.tsx` |
| `useLayoutEffect` | Like `useEffect` but runs before paint | Placing rivet instances in `Suitcase.tsx` |

Patterns to be able to explain:

- **Lifting state up.** `open` and `active` live in `App.tsx`, the common parent of the 3D scene and the 2D panels, so both stay in sync.
- **Props down, callbacks up.** `Scene` receives `open` and `onToggle`; the suitcase calls `onToggle()` and never changes state itself.
- **Cleanup functions.** Every `useEffect` that starts something returns a function that stops it (`removeEventListener`, `clearTimeout`, stopping camera tracks). This prevents leaks and keeps the camera light from staying on.
- **Module-level singletons for heavy engines.** `export const voiceEngine = new VoiceEngine()` creates one engine for the whole app. The panel and the 3D speaker both read from the same object, which is how the speaker cone moves with your voice.
- **A tiny pub/sub store.** `src/idcard/store.ts` holds the latest printed card and notifies subscribers. The 3D ID prop subscribes so it shows the card you just printed. It's the simplest possible "global state" without a library.
- **Keeping chat history across open/close.** `HeistAIPanel.tsx` stores messages in a module-level `savedChat` variable, so unmounting the panel doesn't lose the conversation.

**Learn more**

- [React in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=Tn6-PIqc4UM)
- [10 React Hooks Explained (Fireship)](https://www.youtube.com/watch?v=TNhaISOUy6Q)
- [Learn useRef in 11 Minutes (Web Dev Simplified)](https://www.youtube.com/watch?v=t2ypzz6gJm0)
- Official React docs and tutorial (excellent, interactive): https://react.dev/learn
- "You Might Not Need an Effect" (why the code only uses effects for real side effects): https://react.dev/learn/you-might-not-need-an-effect

---

## 5. The 3D scene: Three.js and React Three Fiber

### The mental model of any 3D scene

Every real-time 3D scene has the same five ingredients:

1. **Scene**: a tree of objects.
2. **Meshes**: a **geometry** (the shape, a list of triangles) plus a **material** (how its surface reacts to light).
3. **Lights**: where light comes from.
4. **Camera**: where you're looking from.
5. **Renderer**: draws it all to a `<canvas>` using the GPU (through WebGL), about 60 times a second.

**Three.js** is the JavaScript library that handles all of that on top of WebGL. **React Three Fiber (R3F)** lets you write the same thing as JSX:

```tsx
<mesh position={[0, 1, 0]} castShadow>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial color="gold" metalness={1} roughness={0.2} />
</mesh>
```

is the same as `new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({...}))` added to the scene. Every Three.js class is available as a lowercase JSX tag. `args` are the constructor arguments.

The two R3F features this app leans on most:

- **`useFrame((state, dt) => { ... })`** runs every frame. `dt` (delta time) is the seconds since the last frame. All 3D animation here happens inside `useFrame` by mutating refs directly (`lid.current.rotation.x = angle`), which **skips React re-renders** and keeps it fast.
- **Pointer events on meshes.** `onClick`, `onPointerOver`, `onPointerOut` work on 3D objects. R3F uses **raycasting**: it shoots an invisible ray from the camera through the mouse position and reports which mesh it hits first. `e.stopPropagation()` stops a click on a module from also counting as a click on the case behind it. Each `ModuleSlot` also has an invisible box (`visible={false}`) as a bigger, easier-to-hit click target.

### Walking through `src/scene/Scene.tsx`

- **`<Canvas shadows dpr={[1, 1.5]} ...>`** creates the renderer. `dpr` caps the pixel ratio at 1.5 so high-DPI laptops don't render 4x the pixels. `antialias: false` because post-processing does its own multisampling.
- **Background, fog and lights.** A near-black background, fog that fades distant things into the dark, a faint blue ambient light, a blue rim light on one side, a red one on the other (the classic "heist movie" two-tone), and a weak warm fill.
- **`<Environment>` with `<Lightformer>`s.** Metals look like metal because they reflect their surroundings. Instead of downloading an HDR photo of a room, the code builds an environment map from a few glowing rectangles and a ring. That's what the chrome corners and gold bars reflect.
- **`Room`, `Table`, `Blueprint`, `Loot`.** Planes for the floor and wall; a `RoundedBox` table with a `MeshReflectorMaterial` top that gives soft, blurred reflections of the case; cash stacks and gold bars made from boxes and a 4-sided cylinder (a cylinder with 4 segments is a square frustum, which is exactly the shape of a gold bar).
- **`Lamp`.** The shade is a `LatheGeometry` (a 2D outline spun around an axis, like a pottery wheel). The bulb is an emissive sphere (`toneMapped={false}` so it can glow brighter than white and trigger bloom). drei's `<SpotLight>` casts shadows *and* draws the visible volumetric cone (`opacity`, `attenuation`, `anglePower`). `<Sparkles>` are the dust motes floating in the beam.
- **`CameraRig`.** drei's `<CameraControls>` animates the camera smoothly with `setLookAt(pos, target, true)`. There are five named shots (`intro`, `closed`, `open`, `focus`, `focusMobile`), and the `fit()` function pulls the camera back on narrow screens so the case still fits. Orbit limits (`minPolarAngle`, `maxAzimuthAngle`, and so on) stop users from spinning under the table.
- **`Effects` (post-processing).** After the scene renders, a chain of full-screen passes runs over the image:
  - **Bloom**: bright pixels (above `luminanceThreshold`) bleed a soft glow. It's what makes the bulb, LEDs and glowing slots glow.
  - **Chromatic aberration**: a tiny RGB split toward the edges, like a real camera lens.
  - **Tone mapping (ACES Filmic)**: compresses bright HDR values into displayable range with a film-like curve.
  - **Vignette**: darkens the corners and pulls the eye to the center.
  - **Noise**: film grain, which also hides color banding in the dark gradients.

### Walking through `src/scene/Suitcase.tsx`

- **Procedural geometry.** `roundedRect()` draws a 2D rounded rectangle with `THREE.Shape`. Adding a smaller rounded rectangle as a *hole* and passing it through `ExtrudeGeometry` produces the case walls (a hollow rounded tube). The same trick with six holes makes the foam insert with its cut-outs. `extrudeUp()` rotates the extrusion so it grows upward.
- **Z-fighting fix.** When two surfaces sit at exactly the same position, the GPU can't decide which is in front and they flicker. The rubber gasket trim is deliberately placed slightly below the wall top so no faces are coplanar. (That was a real bug fixed during the overhaul, and a good story if asked about challenges.)
- **Materials.** `MeshPhysicalMaterial` for the aluminum shell (metalness, roughness, a clearcoat layer and a brushed-metal `roughnessMap`), chrome and brass `MeshStandardMaterial`s, and velvet and leather using the `sheen` property, which simulates fabric fuzz catching light at grazing angles.
- **Instancing.** The rivets use one `instancedMesh`: a single draw call renders every rivet, with one transform matrix per copy. That's much cheaper than dozens of separate meshes.
- **The egg-crate foam in the lid** is a `PlaneGeometry` with 90 × 60 segments whose vertices are pushed up by `sin(x) * sin(y)`, flattened near the edges. Math-generated bumps, no model.
- **The lid** is a `group` positioned at the back hinge line, so rotating the group around X swings the lid about the hinge. This is the standard trick for any door or lid: put the pivot where the hinge is.
- **Latches and combination dials** each run their own small spring (section 6). The dials spin to a code plus two full turns (`code[i] + Math.PI * 4`) with slightly different stiffness each, so they settle one after another like a real lock.
- **`ModuleSlot`** positions each of six slots in a 3 × 2 grid, raises its prop with a spring when the case opens (staggered by `index * 0.07` seconds), lifts it a bit on hover, sways the active one, and fades an emissive glow at the bottom of the cut-out. drei's `<Html>` renders a normal HTML tooltip that tracks a 3D position.
- **Contact shadow**: a soft radial gradient texture on a plane under the case. It's a cheap "ambient occlusion" look that grounds the object on the table.

### Procedural textures: `src/scene/textures.ts`

Every texture is drawn with the **Canvas 2D API** at startup and then wrapped in `THREE.CanvasTexture`: brushed-metal streaks (used as a roughness map, not color), walnut wood grain, the blueprint, the banknote, the dial numbers, and the nameplate. Things to know:

- `colorSpace = SRGBColorSpace` for color textures, but *not* for data textures like roughness. This keeps colors correct.
- `anisotropy = 8` keeps textures sharp at glancing angles.
- A small `memo()` cache means each texture is only generated once.
- `App.tsx` waits for fonts to load before mounting the scene, because textures that draw text would otherwise capture a fallback font.

### The module props

- `VoiceModulatorModule.tsx`: the bronze speaker. Each frame it reads `voiceEngine.getLevel()` and moves the cone and brightens the LED, so the prop visibly reacts to your voice.
- `FaceSwapLensModule.tsx`: the camera lens. It glows while the camera is live, and its LED goes green when a face is locked.
- `FakeIdModule.tsx`: a card on a tray. Its texture is a canvas that copies the last card you printed (via `cardStore`), and the card tilts toward you on hover using `THREE.MathUtils.damp`.
- `PlaceholderModules.tsx`: the HeistAI orb and the Alibi notebook.

**Learn more**

- [Build a Mindblowing 3D Portfolio Website, Three.js Beginner's Tutorial (Fireship)](https://www.youtube.com/watch?v=Q7AOvWpIVHU)
- [Three.js Crash Course For Beginners](https://www.youtube.com/watch?v=_OwJV2xL8M8)
- [React Three Fiber: The Ultimate Guide to 3D Web Development (Wawa Sensei)](https://www.youtube.com/watch?v=EEmRti2q-M0)
- [React Three Fiber (R3F), The Basics](https://www.youtube.com/watch?v=vTfMjI4rVSI)
- [React Three Fiber Crash Course for Beginners](https://www.youtube.com/watch?v=jKy2Rm7EVOk)
- R3F docs (read "Your first scene", "Events" and "Hooks"): https://r3f.docs.pmnd.rs/
- drei docs (look up every helper named above): https://drei.docs.pmnd.rs/
- Three.js manual, especially "Fundamentals", "Materials", "Lights", "Shadows": https://threejs.org/manual/
- Three.js examples gallery: https://threejs.org/examples/
- Three.js Journey by Bruno Simon (the best paid course on Three.js, with an R3F chapter): https://threejs-journey.com/
- Discover Three.js (free online book): https://discoverthreejs.com/
- SBCode R3F tutorials (free, text + code): https://sbcode.net/react-three-fiber/
- pmndrs postprocessing library: https://github.com/pmndrs/postprocessing

---

## 6. Animation: springs, Motion and the choreography

### Why springs instead of fixed-duration tweens

A tween says "go from A to B in 0.5 s with this easing curve". A **spring** says "there's a rubber band pulling toward B, plus some friction". Springs feel physical, they can overshoot and settle, and if the target changes mid-animation they redirect smoothly from the current velocity instead of jumping. That's why the lid, latches, dials and module lifts feel weighty.

### The hand-written spring: `src/lib/spring.ts`

This is a damped harmonic oscillator, the physics of a mass on a spring with friction, in about 20 lines:

```
acceleration = -stiffness × (value − target) − damping × velocity
velocity    += acceleration × h
value       += velocity × h
```

- **Stiffness** = how hard the band pulls (higher is snappier).
- **Damping** = friction (lower means more bounce; high enough means no overshoot, "critically damped").
- It's integrated with **semi-implicit Euler** (update velocity first, then position), which is stable for this kind of system.
- **Sub-stepping**: a frame's `dt` is split into steps of at most 1/120 s, and capped at 0.1 s total. So if a frame stutters or the tab was in the background, the spring doesn't explode.

Examples: the lid uses `new Spring(0, 38, 7.5)` (soft and heavy, a small bounce), the latches `Spring(0, 220, 16)` (quick and snappy).

For simpler "ease toward a value" motion that never overshoots, the code uses `THREE.MathUtils.damp(current, target, lambda, dt)`, which is frame-rate-independent exponential smoothing.

### The open/close choreography

`tickPhase()` in `Suitcase.tsx` measures time since the case last opened or closed, in the same clamped steps as the springs. The sequence:

- **Opening:** latches flip and dials spin right away; at 0.28 s the lid starts swinging; each module rises starting around 0.55 s, staggered 0.07 s apart. The LED strip inside the lid and a warm inner point light fade in with how open the lid is.
- **Closing:** the modules sink first (with a stiffer, more damped spring), the lid holds for a moment, then falls. When it reaches the base it **stops dead** with a tiny settle instead of passing through (`if (angle > 0) { angle = 0; velocity = ... }`).

Because every step is based on accumulated `dt` rather than `setTimeout`, the order holds at any frame rate.

### Motion (formerly Framer Motion) for the 2D UI

`motion/react` animates HTML elements declaratively:

- **`<motion.div initial={...} animate={...} exit={...} transition={...}>`**: describe the start, end and exit states, and Motion animates between them. The panels slide in with blur (`filter: 'blur(12px)'` to `'blur(0px)'`), which reads more expensive than a plain fade.
- **`transition={{ type: 'spring', bounce: 0.18, duration: 0.7 }}`**: Motion's own springs, configured by feel (bounce and duration) instead of stiffness and damping.
- **`<AnimatePresence>`**: lets components animate *out* before React removes them. It's why panels slide away instead of vanishing. `mode="wait"` finishes the exit before the next panel enters.
- **Shared layout animation (`layoutId`)**: when two elements share a `layoutId`, Motion animates one into the other's position. The gold pill in the dock (`layoutId="dock-pill"`) glides between buttons this way; so do the preset, style and role highlights.
- **`layout`** on the dock buttons animates their width changes when the selected one expands to show its name.
- **Custom easing** `[0.22, 1, 0.36, 1]` is a cubic-bezier "ease-out-quint"-like curve: fast start, long gentle landing.

### Two small text effects

- `src/ui/Scramble.tsx`: the tagline "decrypts" from random glyphs, left to right, with a `setInterval`.
- The "Click the case" hint uses an animated gradient behind `bg-clip-text` for a shimmer.

Both check `prefers-reduced-motion` and skip the effect for users who've asked their OS for less motion. (Worth mentioning: it's an accessibility detail.)

**Learn more**

- Motion for React docs (read "Animation", "Layout animations", "AnimatePresence"): https://motion.dev/docs/react
- Motion examples: https://motion.dev/examples
- [Framer Motion (React), The Basics](https://www.youtube.com/watch?v=31y7-k3ZG0g)
- [Framer Motion (React Animation Library) Crash Course](https://www.youtube.com/watch?v=1vKiPwEYbyk)
- Josh Comeau, "A Friendly Introduction to Spring Physics" (interactive and very clear): https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/
- Gaffer On Games, "Fix Your Timestep!" (why sub-stepping and clamped `dt` matter): https://gafferongames.com/post/fix_your_timestep/
- [Mass Spring Dampers: Equation of Motion](https://www.youtube.com/watch?v=PwlntnWtqJc) (the physics behind `spring.ts`)

---

## 7. Styling: Tailwind v4, glass panels and the shader title

### Tailwind CSS v4

Tailwind gives you small utility classes (`flex`, `rounded-2xl`, `px-4`, `text-sm`) that you compose right in the markup, instead of writing separate CSS files. v4 is configured in CSS rather than a JS config file:

- `src/index.css` starts with `@import 'tailwindcss'` and defines the design tokens in `@theme { ... }`: `--color-ink`, `--color-gold`, `--color-laser`, `--color-paper`, and the three fonts. Those become classes like `bg-ink`, `text-gold`, `font-display`.
- Arbitrary values in square brackets: `bg-ink-2/80` (80% opacity), `shadow-[0_40px_120px_-20px_rgba(0,0,0,0.95)]`, `max-h-[64vh]`.
- Responsive prefixes: `md:w-[390px]` applies from the medium breakpoint up. Panels are a bottom sheet on phones and a right-side panel on desktop, from the same markup.

### The "Kokonut UI" glass panel look

Every module panel is built on `src/ui/PanelShell.tsx`, which also exports shared controls (`Section`, `Slider`, `Toggle`, `Button`, `Field`, `ErrorNote`, `Note`). One frame for all five modules is why they look like one product. The ingredients of the glass look:

- A semi-transparent dark background plus `backdrop-blur-2xl` (the browser's `backdrop-filter: blur()` frosts whatever is behind it, here the 3D scene).
- A hairline border at 7% white.
- A huge soft drop shadow.
- `.glow-border`: a rotating **conic gradient** border, animated with a CSS `@property --angle` so the angle itself can transition.
- `.grain`: subtle noise over the panel.

Kokonut UI is a free component collection in this style; the dock, AI chat input and shimmer text follow its patterns.

### The shader title: `src/ui/ShaderTitle.tsx`

This is the "unicorn.studio"-style liquid-gold title, and it's a nice thing to explain because it shows what a **fragment shader** is:

1. The words "Operation *Suitcase*" are drawn in Instrument Serif onto an offscreen 2D canvas, in pure red. This becomes a **mask texture**: red where letters are, black elsewhere. A thin stroke thickens the serif's hairlines so they survive at small sizes.
2. A WebGL canvas draws one rectangle covering the whole title. A tiny **vertex shader** just passes the rectangle's corners through.
3. The **fragment shader** runs once *per pixel, every frame, on the GPU*. For each pixel it:
   - reads the mask to know if the pixel is inside a letter;
   - computes a **bevel** by comparing the mask a pixel above and below (the top edge of each stroke catches light);
   - builds gold color bands from **fractal Brownian motion (fbm)**, which is several layers of smooth value noise added together, drifting over time;
   - adds a diagonal **specular sweep** that travels across every few seconds;
   - adds a soft light and a faint **ripple** around the mouse cursor (`uMouse` is smoothed toward the pointer each frame);
   - reveals the text left to right with a noisy edge (`uReveal` goes 0 to 1 over about two seconds).
4. `ResizeObserver` redraws the mask when the size changes. `prefers-reduced-motion` freezes the animation.

Values passed from JavaScript to a shader (`uTime`, `uMouse`, `uReveal`, `uRes`) are called **uniforms**.

In `App.tsx`, the whole header fades, lifts and blurs out while the case is open, and comes back on close.

**Learn more**

- [Tailwind in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=mr15Xzb1Ook)
- Tailwind v4 docs (theme variables, arbitrary values): https://tailwindcss.com/docs
- Kokonut UI: https://kokonutui.com/
- unicorn.studio (the inspiration for the title): https://www.unicorn.studio/
- [An introduction to Shader Art Coding (kishimisu)](https://www.youtube.com/watch?v=f4s1h2YETNY), the best 20-minute intro to fragment shaders
- [Shader Basics, Blending & Textures, Shaders for Game Devs Part 1 (Freya Holmér)](https://www.youtube.com/watch?v=kfM-yu0iQBk)
- The Book of Shaders (free; read the chapters on noise and fbm): https://thebookofshaders.com/
- Shadertoy (play with shaders in the browser): https://www.shadertoy.com/
- MDN on `backdrop-filter`: https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter
- MDN on `conic-gradient`: https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/conic-gradient

---

## 8. Module 1: Voice Modulator

Files: `src/audio/voiceEngine.ts`, `public/worklets/pitch-shifter.js`, `src/ui/VoiceModulatorPanel.tsx`, `src/modules/VoiceModulatorModule.tsx`.

### The Web Audio API in one paragraph

The browser has a built-in audio engine. You create an `AudioContext`, then create **nodes** (sources, effects, analysers, destinations) and **connect** them into a graph. Audio flows through the graph in real time on a dedicated audio thread, in blocks of 128 samples. Every knob on a node is an `AudioParam` you can change smoothly.

### This app's signal graph

```
mic ─► pitch shifter (AudioWorklet) ─┬─► dry gain ───────────┐
                                     └─► ring modulator ─────┤
                                                              ▼
                                                             mix ─► waveshaper (grit) ─► high-pass ─► low-pass ─► echo
                                                                                                                  │
      echo: ┌─► master                                                                                            │
            └─► delay ◄─► feedback gain        (a loop: each repeat is quieter)                                    │
                  └─► echo wet ─► master ◄──────────────────────────────────────────────────────────────────────┘
master ─► analyser ─► monitor gain ─► speakers
master ─► MediaStreamDestination ─► MediaRecorder (.webm clip)
```

What each effect is and how it works:

| Slider | Technique | How it works |
| --- | --- | --- |
| **Pitch** | Delay-line pitch shifter (AudioWorklet) | See below. |
| **Robot** | Ring modulation | A 50 Hz oscillator is connected to a gain node's `gain` parameter, so the voice is *multiplied* by a sine wave. That creates metallic sum and difference frequencies, the classic Dalek/robot sound. |
| **Radio** | Band-pass "squeeze" | A high-pass filter moves up toward 500 Hz and a low-pass moves down toward 2.8 kHz, with a bit of resonance (Q). A walkie-talkie only passes that narrow band. The frequencies move on an exponential scale (`20 * (500/20)^radio`) because hearing is logarithmic. |
| **Grit** | Waveshaper distortion | A `WaveShaperNode` maps every sample through a `tanh` curve. `tanh` squashes loud peaks smoothly (soft clipping), adding harmonics. `oversample = '4x'` reduces aliasing. |
| **Echo** | Feedback delay | A 0.28 s `DelayNode` whose output feeds back into itself through a gain below 1, so each echo is quieter. |
| **Volume** | Master gain | |

Every change uses `setTargetAtTime(value, now, 0.03)`, which glides the parameter over about 30 ms. Jumping a gain instantly causes audible clicks ("zipper noise").

### The pitch shifter (`public/worklets/pitch-shifter.js`)

An **AudioWorklet** is your own JavaScript running *on the audio thread*, sample by sample, which is the only way to write custom DSP in the browser without glitches.

The trick: incoming samples are written into a circular buffer (a "delay line"). Two **read heads** read from it at a varying delay. If the read point moves *toward* the write point, you're effectively playing faster, so the pitch goes up; moving *away* plays slower and lowers pitch. A head can't drift forever, so each one sweeps across a 1536-sample window and jumps back. To hide the jump, two heads run half a window apart and are **crossfaded** with triangle-shaped gains (one is silent exactly when it jumps). Reads between samples use **linear interpolation**.

This is a classic, low-latency technique (the family is called delay-line or "granular" pitch shifting). The honest trade-off: it can sound a little warbly or phasey on big shifts, compared with heavier FFT-based algorithms like a phase vocoder. It was picked because it adds almost no latency, which matters when you're listening to yourself live.

### Getting the mic, level meter, recording

- `navigator.mediaDevices.getUserMedia({ audio: {...} })` asks for the mic. `echoCancellation` and `noiseSuppression` are on; `autoGainControl` is off so the level meter is honest. **The browser only allows this on `localhost` or HTTPS.**
- `AnalyserNode` gives the waveform and the frequency spectrum (an FFT of 2048). `getLevel()` computes the **RMS** (root mean square), the standard loudness measure, which drives the 3D speaker cone and LED. The panel's visualiser reads `getByteFrequencyData`.
- **Monitoring** ("Hear myself") is just a gain node set to 0 or 1 before the speakers. Use headphones, or the speakers feed back into the mic.
- **Recording**: `MediaStreamAudioDestinationNode` turns the processed audio back into a `MediaStream`, and `MediaRecorder` encodes it to a `.webm` file.

**Learn more**

- MDN, Web Audio API overview: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MDN, Using the Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API
- MDN, AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- Chrome for Developers, "Audio Worklet is now available by default": https://developer.chrome.com/blog/audio-worklet
- [Working with audio worklets in the Web Audio API](https://www.youtube.com/watch?v=_MH2wmkBqvI)
- [Web Audio API Tutorial: Build a Synthesizer and Frequency Analyser](https://www.youtube.com/watch?v=p0Fv9CX1FGc)
- [HTML5 Web Audio API Tutorial: Manipulating Audio in the Browser](https://www.youtube.com/watch?v=xmGv_Schm5U)
- MDN, MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Ring modulation explained (Wikipedia): https://en.wikipedia.org/wiki/Ring_modulation
- Pitch shifting overview (Wikipedia, "Audio time stretching and pitch scaling"): https://en.wikipedia.org/wiki/Audio_time_stretching_and_pitch_scaling

---

## 9. Module 2: Face-Swap Lens

Files: `src/vision/faceSwapEngine.ts`, `src/ui/FaceSwapPanel.tsx`, `src/modules/FaceSwapLensModule.tsx`, `scripts/copy-mediapipe.mjs`, `public/models/face_landmarker.task`.

### What it actually is (say this precisely)

It is **not** a generative "deepfake" neural network that invents new pixels. It's a **real-time face-mesh warp**: an ML model finds the geometry of both faces, and the GPU stretches the photo's face over yours, triangle by triangle. That's the same idea behind many AR face filters. Being precise about this impresses judges more than overclaiming.

### Step by step

1. **Face landmarks with MediaPipe.** Google's **MediaPipe Face Landmarker** is a small neural network that, given an image, returns **468 3D points** on the face (plus 10 iris points the mesh doesn't use). Points are *normalized*: x and y from 0 to 1 across the image, and z is relative depth. It runs locally through **WebAssembly (WASM)**, on the GPU delegate if available and falling back to CPU.
   - Two instances are created: one in `VIDEO` mode (optimized for consecutive frames, called with a timestamp every frame) and one in `IMAGE` mode (for the uploaded photo, run once).
   - The model file ships in `public/models/`, and the WASM runtime is copied from `node_modules` into `public/mediapipe` by `scripts/copy-mediapipe.mjs` before dev and build. Result: **works fully offline, no CDN, no uploads.**
2. **Turning points into triangles.** MediaPipe publishes its face mesh as a list of *edges* (`FACE_LANDMARKS_TESSELATION`). `buildTriangles()` rebuilds the triangles by finding every trio of points that are all connected to each other. The eyes and mouth are *holes* in that mesh, so your real eyes and mouth show through: that's why blinking and talking look natural.
3. **The key idea, UV mapping.** Every vertex of the face mesh gets two coordinates:
   - its **position** = where that landmark is on *your* live face this frame;
   - its **texture coordinate (UV)** = where the same landmark is on the *photo*.
   The GPU then fills each triangle by sampling the photo. Since landmark #1 on the photo lands on landmark #1 on you, and so on for all 468, the photo's face is warped onto yours and follows your head, mouth and expressions.
4. **Soft edges (feathering).** A breadth-first search from the face-oval outline counts how many mesh "hops" each vertex is from the edge. The outer three rings get alpha 0, 0.45 and 0.85, so the mask fades into your real skin instead of having a hard border.
5. **Skin match.** It samples the average color at interior face points on both the photo and your camera (re-measured every 10 frames because lighting changes slowly), computes a per-channel gain `live / photo` clamped to 0.65–1.5, and the fragment shader multiplies the photo by it. This is a simple form of **color transfer**, so the mask sits in your room's lighting.
6. **Depth test.** z values feed WebGL's depth buffer so when you turn your head, the far cheek stays behind the nose.
7. **Rendering with raw WebGL2.** Two shader programs: one draws the webcam frame as a full-screen quad (optionally mirrored for a selfie view), the other draws the face mesh with alpha blending. Buffers hold positions (updated every frame with `bufferSubData`), UVs (set once per photo), alpha, and triangle indices. "Show tracking mesh" draws the edge list as `gl.LINES` instead.
8. **Snapshot and record.** `canvas.toBlob()` saves a PNG; `canvas.captureStream(30)` + `MediaRecorder` records a `.webm`.

Why raw WebGL2 rather than Three.js here? It's a 2D video effect with one custom mesh, so a couple of hand-written shaders are smaller and faster than pulling in a scene graph, and they make every step visible.

**Learn more**

- MediaPipe Face Landmarker guide for Web: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
- MediaPipe Face Landmarker overview and live demo: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- MediaPipe face mesh docs, including the canonical mesh and landmark map: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md
- [ML solutions in MediaPipe for Plain JavaScript](https://www.youtube.com/watch?v=kuY-m6id4F4)
- [Mediapipe face mesh for web to determine head direction](https://www.youtube.com/watch?v=GvE7fx47YYg)
- [Build A Spooky Mask Maker with Facemesh & p5.js](https://www.youtube.com/watch?v=yrsxDOBL5xM), which uses the same "texture onto face mesh" idea
- [WebGL 3D Graphics Explained in 100 Seconds](https://www.youtube.com/watch?v=f-9LEoYYvE4)
- [WebGL Tutorial 01: Setup and Triangle](https://www.youtube.com/watch?v=kB0ZVUrI4Aw)
- WebGL2 Fundamentals (the best free WebGL course; read "Fundamentals", "How it works", "Textures"): https://webgl2fundamentals.org/
- MDN WebGL tutorial: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial
- MDN, getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN, WebAssembly concepts: https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts

---

## 10. Modules 3 and 4: HeistAI and the Alibi Generator

Files: `server/heistApi.ts` (server side), `src/ai/heistApi.ts` (browser side), `src/ui/HeistAIPanel.tsx`, `src/ui/AlibiPanel.tsx`, `.env.example`.

### The architecture, and why

```
Browser panel ──fetch POST /api/heistai──► Vite dev server (Node) ──Anthropic SDK──► Claude API
             ◄──── streamed plain text ────                       ◄── streamed events ──
```

**Why not call Claude straight from the browser?** Anything in browser code is public: anyone can open DevTools and read it. An API key there would be stolen and billed to you. So the key lives in `.env.local` on the laptop (gitignored), is read by the server (`loadEnv(...)` in the plugin's `configResolved`), and never leaves it. The browser only talks to our own `/api/...` routes. This is the standard **backend-for-frontend** or **API proxy** pattern.

**How the endpoints exist without a separate server.** `heistApiPlugin()` is a Vite plugin. Its `configureServer` and `configurePreviewServer` hooks add Connect middleware (`middlewares.use('/api/heistai', ...)`) to Vite's own server. Result: `npm run dev` gives you the app *and* the API on one port. The trade-off: a plain static host (GitHub Pages, a bare `dist/` upload) has no server, so the two AI modules won't work there. Everything else will.

### What the server does (`server/heistApi.ts`)

- **Validation and limits.** Only `POST` is accepted. The body is capped at 200 KB. `sanitizeMessages()` keeps only well-formed `user`/`assistant` messages, the last 30, each trimmed to 4000 characters. Form fields are trimmed and length-limited. This keeps costs bounded and stops junk input.
- **Friendly errors.** No key gives a 503 with setup instructions. The SDK's typed errors (`AuthenticationError`, `RateLimitError`, `APIConnectionError`) are turned into readable messages.
- **Cancellation.** An `AbortController` is tied to the response's `close` event, so if the user closes the panel mid-reply, the Claude request is cancelled too.
- **Model settings.** `claude-opus-5-5`, `output_config: { effort: 'low' }` for fast replies, and a server-side model fallback beta so a request still succeeds if the primary model is busy.

### HeistAI: a streaming chat

- **System prompt.** `HEISTAI_SYSTEM` sets the character: a wisecracking heist mastermind, movie-plot fiction only (Ocean's Eleven, Money Heist, Lupin), steer away from real-world crime instructions, recommend the suitcase's other gadgets, keep replies short and in plain text. The system prompt is how you give a model a persona and rules. It's worth reading aloud in the demo.
- **The conversation.** The Messages API is *stateless*: every request sends the whole conversation so far as an array of `{ role, content }`. The browser keeps that array; the server forwards it.
- **Streaming.** `client.beta.messages.stream(...)` returns events as the model writes. The server forwards every `text_delta` chunk straight into the HTTP response. On the browser side, `streamHeistAI()` reads `res.body` with a `TextDecoderStream` reader and calls `onText(chunk)` for each piece, so words appear as they're generated, like ChatGPT or Claude.ai. The "typing" dots show until the first chunk arrives.
- **Refusals.** If `stop_reason` is `refusal`, a playful in-character note is shown instead of an error.

### Alibi Generator: structured output

- The form sends `crime`, `whereabouts`, `crew` and `style`. Blank fields get fun defaults ("A priceless diamond vanished from the city museum at midnight").
- **Structured outputs.** The request includes `output_config.format = { type: 'json_schema', schema: ALIBI_SCHEMA }`. The schema lists every field (`codename`, `headline`, `story`, `timeline[]`, `witnesses[]`, `evidence[]`, `weakSpots[]`, `rehearsalLine`) with descriptions. Claude's reply is constrained to valid JSON of that shape, so the panel can render a case file with sections instead of guessing how to parse free text. The `description`s in the schema double as instructions ("4-6 timestamped beats covering the night").
- The TypeScript `Alibi` type in `src/ai/heistApi.ts` matches the schema, and `alibiToText()` flattens it for "Copy alibi".
- `max_tokens` guards: if the output is cut off (`stop_reason === 'max_tokens'`) the user is asked to retry rather than getting broken JSON.

### Talking points about AI safety and ethics

- Both prompts keep everything fictional and lighthearted, and HeistAI is told to redirect real-world crime requests back to movie-plot territory.
- The alibi prompt forbids defaming real people and invents witness names.
- Claude's own safety training sits underneath that.

**Learn more**

- Claude developer docs (start at "Get started", then "Messages", "Streaming", "Structured outputs", "System prompts"): https://docs.claude.com/
- Anthropic TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript
- Anthropic's free courses (API fundamentals, prompt engineering, tool use): https://github.com/anthropics/courses
- [AI prompt engineering: A deep dive (Anthropic)](https://www.youtube.com/watch?v=T9aRN5JkmL8)
- [Prompting 101 (Anthropic)](https://www.youtube.com/watch?v=FMWRfZ_VNdw)
- [Build with Claude as a JavaScript developer](https://www.youtube.com/watch?v=LLTUWZO8D0g)
- [Claude API Crash Course #1: Introduction & Setup](https://www.youtube.com/watch?v=H7LZb20-fUY)
- JSON Schema, getting started: https://json-schema.org/learn/getting-started-step-by-step
- MDN, Streams API (how the browser reads a streamed response): https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
- MDN, AbortController: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- Vite env variables and `.env` files: https://vite.dev/guide/env-and-mode

---

## 11. Module 5: ID Forge

Files: `src/idcard/template.ts`, `render.ts`, `camera.ts`, `store.ts`, `src/ui/FakeIdPanel.tsx`, `src/modules/FakeIdModule.tsx`.

### How it works

1. **Camera.** `openCamera()` calls `getUserMedia({ video: { facingMode: 'user', ... } })` and the stream is attached to a `<video>` element. When the panel closes, a `useEffect` cleanup stops every track, so the camera light turns off.
2. **Countdown and snap.** A 3-2-1 countdown (a `useEffect` with a one-second `setTimeout` per step), then `snapshot()` copies the current video frame into a canvas. It **center-crops** to the photo box's aspect ratio and **mirrors** it (`translate` + `scale(-1, 1)`) so it matches the selfie preview people are used to. A flash animation plays. No camera? You can upload a file instead (`fileToImage`).
3. **Template-driven rendering.** A `CardTemplate` is plain data: the card size (1012 × 638, the real CR80 credit-card ratio), where the photo box goes, and a list of text fields with position, font, color and max width. `renderCard()` paints the background (drawn in code, or an image if `background` is set), clips the photo into a rounded box with **cover-fit** scaling (fills the box, crops the overflow), draws each field, then runs `drawOverlay`.
4. **Auto-fit text.** If a name is too long, `fitText()` squashes it horizontally to fit the field, like a real card printer, rather than overflowing.
5. **Safety overlay.** The overlay draws a big diagonal **NOVELTY** watermark, a "NOT A VALID UNIVERSITY OR GOVERNMENT ID" line and a decorative barcode that encodes nothing. The design is an *original* "Rowdy Heist Crew" card in UTSA-inspired navy and orange, not a copy of the real UTSA ID.
6. **Download and 3D.** `canvas.toBlob()` makes a PNG you can download. Each re-render also pushes the canvas into `cardStore`, and the 3D card on the tray in the suitcase copies it into its `CanvasTexture` (`texture.needsUpdate = true`), so the prop in the case shows *your* card.

To use a different card design, put an image in `public/`, set `background: '/my-card.png'` in the template, and move the boxes.

**Learn more**

- MDN Canvas tutorial (drawing, text, images, transformations, clipping): https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial
- MDN, `drawImage` (the 9-argument crop form used in `snapshot()`): https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
- [Unreal Webcam Fun with getUserMedia() and HTML5 Canvas (Wes Bos, JavaScript30)](https://www.youtube.com/watch?v=ElWFcBlVk-o)
- [Access WebCam using JavaScript](https://www.youtube.com/watch?v=Yqdc34sqihc)
- Three.js `CanvasTexture`: https://threejs.org/docs/#api/en/textures/CanvasTexture

---

## 12. Questions judges will probably ask

**"What did you build it with?"**
React and TypeScript on Vite, React Three Fiber on top of Three.js for the 3D, Motion for UI animation, Tailwind for styling, the Web Audio API for the voice changer, MediaPipe and WebGL2 for the face swap, Canvas 2D for the ID card, and the Claude API for the two AI modules.

**"Where did the 3D models come from?"**
Nowhere; they're all generated in code. The case is 2D rounded rectangles extruded into 3D, with holes cut for the foam slots. Textures like the wood, brushed metal and banknotes are drawn with the Canvas API at startup. There's no model or image download in the scene.

**"How does the face swap work? Is it a deepfake?"**
It's a real-time face-mesh warp, not a generative model. MediaPipe finds 468 landmarks on your face every frame and the same 468 on the photo once. WebGL draws a mesh where each vertex sits at your landmark but samples the photo at the matching landmark, so the photo's face stretches onto yours. The edges fade out, and the skin tone is matched to your lighting. It all runs in the browser, so no video leaves your computer.

**"How does the voice changer change pitch without making you sound slowed down?"**
It's a delay-line pitch shifter in an AudioWorklet: two read heads sweep through a short buffer of recent audio at a different speed than it's written, crossfading so you never hear them jump. That changes pitch while keeping real-time timing. The other effects are standard DSP: ring modulation for robot, band-pass filtering for radio, tanh waveshaping for grit, a feedback delay for echo.

**"How do you keep the API key safe?"**
The key is only on the server side, in `.env.local`, which is gitignored. The browser calls our own `/api` endpoints, a Vite plugin on the dev server, and that server calls Claude. The key never ships to the browser.

**"How do you get structured results from the AI?"**
The alibi request passes a JSON Schema as the output format, so Claude's reply is guaranteed to be JSON in that exact shape, and the UI renders each section directly.

**"How is the chat so responsive?"**
Streaming. The server forwards each text chunk as Claude generates it, and the browser reads the response body as a stream and appends each piece.

**"What was the hardest part?"**
Good candidates, all true: the case open/close choreography (latches, dials, lid and modules each on their own spring, sequenced so it works at any frame rate, with the lid stopping dead on the base instead of swinging through); z-fighting flicker on the rim, fixed by offsetting the trim so no faces are coplanar; making the face mask blend in (feathering by mesh distance plus color matching); and keeping five heavy real-time features smooth by running them outside React's render cycle.

**"Is the fake ID a problem?"**
It's an original novelty design in school colors, not a copy of the real UTSA ID, with a big NOVELTY watermark, a "not a valid ID" line and a barcode that encodes nothing.

**"What stops people using HeistAI for real crimes?"**
Its system prompt keeps it in movie-plot fiction and tells it to redirect real-world requests, and Claude's own safety training applies on top.

**"Does it work on a phone?"**
Yes, the layout adapts: panels become bottom sheets and the camera has its own shots for narrow screens. The camera and mic need HTTPS or localhost.

**"What would you add next?"**
The sixth slot is open. Other ideas: deploying the AI endpoints as serverless functions so the whole app works on a static host, multiplayer "crew" rooms, and voice input for HeistAI.

---

## 13. Demo-day checklist

- [ ] `npm install`, then `npm run dev`, and open `http://localhost:5173`. Mic and camera only work on `localhost` or HTTPS.
- [ ] `.env.local` has `ANTHROPIC_API_KEY=...`, and the dev server was restarted after adding it. Test HeistAI and the Alibi Generator once before presenting.
- [ ] Allow mic and camera permissions in the browser ahead of time.
- [ ] Bring **headphones** for the voice demo ("Hear myself" through laptop speakers will feed back).
- [ ] Have a clear, front-facing face photo ready for the face swap. Good even lighting on your face helps tracking.
- [ ] Toggle "Show tracking mesh" in the face swap: the wireframe is a great visual for explaining how it works.
- [ ] Use Chrome or Edge for the best WebGL2, AudioWorklet and MediaRecorder support.
- [ ] Plug the laptop in; the GPU runs harder on battery-saver settings otherwise.
- [ ] Suggested order: open the case (let the choreography play), Voice Modulator (Robot, then Deep Boss), Face-Swap Lens (mesh on, then swap), ID Forge (snap, show the 3D card update), HeistAI (a starter prompt), Alibi Generator.
- [ ] Press Escape to close a panel, and again to close the case.

---

## 14. Glossary

| Term | Meaning |
| --- | --- |
| **AudioContext** | The Web Audio engine; every audio node belongs to one. |
| **AudioWorklet** | Your own audio-processing code running on the audio thread. |
| **Bloom** | Post-processing glow around bright areas. |
| **Canvas 2D** | The browser's immediate-mode drawing API (`getContext('2d')`). |
| **Delta time (`dt`)** | Seconds since the last frame; multiply by it so motion is frame-rate independent. |
| **Draw call** | One command to the GPU to draw something; fewer is faster (hence instancing). |
| **Emissive** | A material color that glows on its own, regardless of lights. |
| **Environment map** | A 360° image of the surroundings that shiny materials reflect. |
| **fbm (fractal Brownian motion)** | Layered noise at increasing frequency, used for natural-looking patterns. |
| **Fragment shader** | GPU program that computes the color of each pixel. |
| **Geometry** | A mesh's shape: vertices, triangles, normals, UVs. |
| **HMR** | Hot Module Replacement: updating code in the running page without a reload. |
| **Instancing** | Drawing many copies of one mesh in a single draw call. |
| **Landmarks** | Key points an ML model finds on a face or body. |
| **Material** | How a surface responds to light (color, metalness, roughness...). |
| **PBR** | Physically based rendering: materials described with real-world properties like metalness and roughness. |
| **Post-processing** | Full-screen effects applied after the 3D scene renders. |
| **Raycasting** | Shooting a ray into the scene to find what the mouse is over. |
| **Ring modulation** | Multiplying audio by a sine wave; gives a robotic tone. |
| **RMS** | Root mean square; the standard measure of signal loudness. |
| **Spring (damped)** | Physics-based animation with stiffness and damping. |
| **Streaming** | Sending a response in chunks as it's produced. |
| **Structured output** | Constraining an AI's reply to match a JSON Schema. |
| **System prompt** | Instructions that set an AI model's role and rules for a conversation. |
| **Tone mapping** | Converting HDR brightness into the screen's displayable range. |
| **Uniform** | A value passed from JavaScript to every run of a shader. |
| **UV coordinates** | Where on a texture each vertex samples from. |
| **Vertex shader** | GPU program that positions each vertex. |
| **WASM (WebAssembly)** | A fast binary format browsers run; MediaPipe's engine is compiled to it. |
| **WebGL / WebGL2** | The browser's API for GPU graphics (based on OpenGL ES). |
| **Z-fighting** | Flicker when two surfaces occupy the same depth. |

---

## 15. A study plan

If you have a few evenings, this order builds on itself:

1. **React and the toolchain (1 to 2 hours).** Watch React in 100 Seconds, 10 React Hooks Explained and Vite in 100 Seconds. Then read `src/App.tsx` top to bottom; you should now be able to explain every line.
2. **3D basics (2 to 3 hours).** Watch Fireship's Three.js tutorial and the R3F basics video. Read R3F's "Your first scene" and "Events". Then read `Scene.tsx`, and try changing the lamp color or a camera shot and watch it update live.
3. **The suitcase and springs (1 to 2 hours).** Read Josh Comeau's spring article, then `lib/spring.ts` and the `useFrame` in `Suitcase.tsx`. Try changing the lid spring's stiffness and damping.
4. **Shaders (2 hours).** Watch kishimisu's shader intro, skim The Book of Shaders' noise chapter, then read `ShaderTitle.tsx`'s fragment shader line by line.
5. **Audio (1 to 2 hours).** Read MDN's "Using the Web Audio API", then `voiceEngine.ts` with the signal graph diagram above next to it. Then read `pitch-shifter.js`.
6. **Face tracking (2 hours).** Try the MediaPipe Face Landmarker live demo, read WebGL2 Fundamentals' first three lessons, then read `faceSwapEngine.ts` in this order: `start` → `loop` → `draw` → `setSource` → `buildTriangles`.
7. **AI (1 hour).** Watch Anthropic's prompting video, skim the docs on streaming and structured outputs, then read `server/heistApi.ts` and `src/ai/heistApi.ts` side by side.
8. **Rehearse.** Practice the pitch and the judge answers out loud twice, then do the demo checklist on the actual laptop you'll present from.

---

## 16. All links in one place

**Videos**

- [React in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=Tn6-PIqc4UM)
- [10 React Hooks Explained (Fireship)](https://www.youtube.com/watch?v=TNhaISOUy6Q)
- [Learn useRef in 11 Minutes (Web Dev Simplified)](https://www.youtube.com/watch?v=t2ypzz6gJm0)
- [TypeScript in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=zQnBQ4tB3ZA)
- [Vite in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=KCrXgy8qtjM)
- [Tailwind in 100 Seconds (Fireship)](https://www.youtube.com/watch?v=mr15Xzb1Ook)
- [Build a Mindblowing 3D Portfolio Website, Three.js Beginner's Tutorial (Fireship)](https://www.youtube.com/watch?v=Q7AOvWpIVHU)
- [Three.js Crash Course For Beginners](https://www.youtube.com/watch?v=_OwJV2xL8M8)
- [React Three Fiber: The Ultimate Guide to 3D Web Development (Wawa Sensei)](https://www.youtube.com/watch?v=EEmRti2q-M0)
- [React Three Fiber (R3F), The Basics](https://www.youtube.com/watch?v=vTfMjI4rVSI)
- [React Three Fiber Crash Course for Beginners](https://www.youtube.com/watch?v=jKy2Rm7EVOk)
- [Framer Motion (React), The Basics](https://www.youtube.com/watch?v=31y7-k3ZG0g)
- [Framer Motion (React Animation Library) Crash Course](https://www.youtube.com/watch?v=1vKiPwEYbyk)
- [Mass Spring Dampers: Equation of Motion](https://www.youtube.com/watch?v=PwlntnWtqJc)
- [An introduction to Shader Art Coding (kishimisu)](https://www.youtube.com/watch?v=f4s1h2YETNY)
- [Shader Basics, Blending & Textures, Shaders for Game Devs Part 1 (Freya Holmér)](https://www.youtube.com/watch?v=kfM-yu0iQBk)
- [WebGL 3D Graphics Explained in 100 Seconds](https://www.youtube.com/watch?v=f-9LEoYYvE4)
- [WebGL Tutorial 01: Setup and Triangle](https://www.youtube.com/watch?v=kB0ZVUrI4Aw)
- [Working with audio worklets in the Web Audio API](https://www.youtube.com/watch?v=_MH2wmkBqvI)
- [Web Audio API Tutorial: Build a Synthesizer and Frequency Analyser](https://www.youtube.com/watch?v=p0Fv9CX1FGc)
- [HTML5 Web Audio API Tutorial: Manipulating Audio in the Browser](https://www.youtube.com/watch?v=xmGv_Schm5U)
- [ML solutions in MediaPipe for Plain JavaScript](https://www.youtube.com/watch?v=kuY-m6id4F4)
- [Mediapipe face mesh for web to determine head direction](https://www.youtube.com/watch?v=GvE7fx47YYg)
- [Build A Spooky Mask Maker with Facemesh & p5.js](https://www.youtube.com/watch?v=yrsxDOBL5xM)
- [Unreal Webcam Fun with getUserMedia() and HTML5 Canvas (Wes Bos)](https://www.youtube.com/watch?v=ElWFcBlVk-o)
- [Access WebCam using JavaScript](https://www.youtube.com/watch?v=Yqdc34sqihc)
- [AI prompt engineering: A deep dive (Anthropic)](https://www.youtube.com/watch?v=T9aRN5JkmL8)
- [Prompting 101 (Anthropic)](https://www.youtube.com/watch?v=FMWRfZ_VNdw)
- [Build with Claude as a JavaScript developer](https://www.youtube.com/watch?v=LLTUWZO8D0g)
- [Claude API Crash Course #1: Introduction & Setup](https://www.youtube.com/watch?v=H7LZb20-fUY)

**Docs, courses and references**

- React: https://react.dev/learn
- Vite: https://vite.dev/guide/ and plugins: https://vite.dev/guide/api-plugin
- TypeScript handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- Tailwind CSS: https://tailwindcss.com/docs
- Motion for React: https://motion.dev/docs/react
- Three.js manual: https://threejs.org/manual/ and examples: https://threejs.org/examples/
- React Three Fiber: https://r3f.docs.pmnd.rs/
- drei: https://drei.docs.pmnd.rs/
- pmndrs postprocessing: https://github.com/pmndrs/postprocessing
- Three.js Journey (paid course): https://threejs-journey.com/
- Discover Three.js (free book): https://discoverthreejs.com/
- SBCode R3F tutorials: https://sbcode.net/react-three-fiber/
- The Book of Shaders: https://thebookofshaders.com/
- Shadertoy: https://www.shadertoy.com/
- WebGL2 Fundamentals: https://webgl2fundamentals.org/
- MDN WebGL tutorial: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial
- MDN Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MDN AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- MDN getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- MDN Canvas tutorial: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial
- MDN Streams API: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
- MediaPipe Face Landmarker (web): https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
- MediaPipe face mesh reference: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md
- Claude developer docs: https://docs.claude.com/
- Anthropic TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript
- Anthropic courses: https://github.com/anthropics/courses
- JSON Schema: https://json-schema.org/learn/getting-started-step-by-step
- Josh Comeau on spring physics: https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/
- Gaffer On Games, "Fix Your Timestep!": https://gafferongames.com/post/fix_your_timestep/
- Kokonut UI: https://kokonutui.com/
- unicorn.studio: https://www.unicorn.studio/
