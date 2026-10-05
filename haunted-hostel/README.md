# Haunted Hostel

A first-person survival horror game set in **Kaveri Hostel, Block B** — an old Indian engineering
college hostel — at 2:07 AM during the semester break. It is raining. The building is supposed to
be empty. Room 217 has been sealed since a student disappeared in 2016.

Built with **Three.js (WebGL 2) + TypeScript + Vite**, packaged for Android with **Capacitor**.
Every texture, model, sound and piece of music is generated procedurally at load time — the game
ships no image, model or audio files.

## Why this stack

Three.js gives full control over a forward PBR renderer that runs on mid-range Android WebViews,
and procedural generation removes asset licensing and download size entirely (the production
build is ~1 MB of JavaScript). Capacitor wraps the same build as a native Android app.

## Run locally

```bash
cd haunted-hostel
npm ci
npm run dev          # http://127.0.0.1:5174
```

URL options: `?fps` shows an FPS / draw-call / triangle readout, `?touch` forces the touch UI on
desktop, `?autostart` skips the "tap to begin" gate, `?debug` exposes `window.__hh.dbg` and keeps
the game running when the mouse is released.

| Command            | What it does                                                                   |
| ------------------ | ------------------------------------------------------------------------------ |
| `npm run dev`      | Vite dev server with hot reload                                                |
| `npm test`         | Vitest (97 tests): puzzles, collision, nav graph, procedural audio, saves      |
| `npm run build`    | Type-check and production build into `dist/`                                   |
| `npm run preview`  | Serve the production build on port 4174                                        |
| `npm run playtest` | Playwright plays all five chapters + bad and secret endings, takes screenshots |
| `npm run shots`    | Desktop + mobile screenshots of menus, HUD and key locations                   |

## Build for Android

Requirements: Node 22, Android Studio (Hedgehog or newer) with an Android SDK (API 34+), JDK 17.

```bash
cd haunted-hostel
npm ci
npm run build
npx cap add android          # first time only — creates android/
npx cap sync android         # copies dist/ into the native project
npx cap open android         # opens Android Studio → Run ▶ or Build ▸ Generate Signed Bundle/APK
```

Afterwards `npm run android:sync` rebuilds the web app, syncs it and runs
`scripts/android-config.mjs`, which locks the activity to `sensorLandscape`, makes it fullscreen
(including display cut-outs) and enables hardware acceleration. `npx cap add android` and the sync
were verified in this repository; producing the APK itself requires the Android SDK. The **EXIT** menu item calls
`App.exitApp()` when running inside Capacitor.

## Controls

| Action          | Desktop               | Touch                                          |
| --------------- | --------------------- | ---------------------------------------------- |
| Move            | W A S D               | Left half: floating virtual joystick           |
| Look            | Mouse (click to lock) | Right half: drag                               |
| Sprint          | Shift                 | Sprint button, or push the stick fully forward |
| Crouch          | C / Ctrl              | Crouch button                                  |
| Jump            | Space                 | Jump button                                    |
| Interact / hide | E / left click        | Hand button (glows when something is in reach) |
| Leave hiding    | E                     | Hand button                                    |
| Hold breath     | Space (while hidden)  | Lungs button (appears while hidden)            |
| Flashlight      | F / right click       | Torch button                                   |
| Inventory       | Tab / I               | Bag button                                     |
| Phone           | Q                     | Phone button                                   |
| Pause           | Esc / P               | Pause button                                   |

Touch controls are customisable (Settings → Controls → _Customize touch controls_): drag any
button to move it, change size and opacity, swap to a left-handed layout, make sprint a toggle.

## Graphics settings

Presets **LOW / MEDIUM / HIGH / ULTRA** (MEDIUM is the default on touch devices, HIGH on desktop),
plus individual options:

| Setting         | Effect                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Shadow quality  | Off / 512 / 1024 / 2048 flashlight shadow map; static moonlight shadow map refreshed on lightning |
| Texture quality | Procedural texture resolution 256 / 512 / 512 / 1024 (applies on restart)                         |
| Effects quality | Real light pool size (3/4/6/8), MSAA, chromatic aberration, beam cone, dust, rain density, HRTF   |
| Fog quality     | Fog density tuning                                                                                |
| Render scale    | 50–100 % of device resolution (× devicePixelRatio, capped at 2)                                   |
| FPS limit       | 30 / 60 / unlimited                                                                               |

Accessibility: subtitles for all spoken/whispered lines and important sounds, look sensitivity,
invert look, FOV, brightness, head-bob toggle, vibration toggle, four volume sliders, and a
language-ready string table (`src/core/i18n.ts`).

## Project structure

```
haunted-hostel/
├── index.html, vite.config.ts, capacitor.config.ts
├── public/                      icon + web manifest
├── scripts/                     Playwright playtest, screenshots, probes
├── tests/                       Vitest unit tests
└── src/
    ├── main.ts                  bootstrap, fonts, fatal-error screen
    ├── game/game.ts             orchestrator: modes, frame loop, save/load, fear, ambience
    ├── core/                    rng, tileable noise, settings, i18n, event bus, storage
    ├── render/
    │   ├── engine.ts            renderer, camera, post-processing chain, resize, FPS limit
    │   ├── postfx.ts            vignette, grain, chromatic aberration, lens distortion, CCTV look
    │   ├── weather.ts           GPU rain + ripples, lightning, thunder, moonlight shadows
    │   └── textures/            PBR recipes (albedo/normal/roughness/AO/metal), worker pool
    ├── world/
    │   ├── layout.ts            building data: bays, floors, rooms, stairs, lift
    │   ├── hostel.ts            walls with openings, floors, stairs, terrace, grille, balcony
    │   ├── interiors.ts         every furnished room (unique layouts and story props)
    │   ├── exterior.ts          courtyard, gate, booth, shrine, trees, bikes, poles, sky
    │   ├── doors.ts, lift.ts    hinged doors with locks; the travelling lift
    │   ├── props/               furniture, fixtures (tube lights, fans, switchboards…), outdoor
    │   ├── textArt.ts           notices, newspapers, calendars, photographs, graffiti
    │   ├── collision.ts         AABB world (cylinder player, ray/segment tests)
    │   └── geom.ts              metre-UV box builder, static batching
    ├── player/                  input, controller, flashlight, interaction, hiding
    ├── enemy/                   ghost model, procedural animation, AI, nav graph, apparitions
    ├── systems/                 lighting, power grid, puzzles, CCTV, phone, events, save, state
    ├── story/story.ts           the five chapters: objectives, triggers, scares, endings
    ├── audio/                   procedural synth (tested) + Web Audio engine
    ├── data/                    items, documents (story text)
    └── ui/                      HUD, menus, settings, inventory, documents, puzzles, touch controls
```

## The game

Five chapters (≈30–60 minutes on a first playthrough):

1. **Arrival** — through the gate in the rain, find the security room, your key, restore power
   with the breaker panel, reach Room 214. The lift stops at a floor that does not exist.
2. **The Empty Floor** — knocking from sealed Room 217; the warden's office opens by itself; the
   key-cabinet code is the date on every calendar in the building.
3. **Something Is Here** — she starts appearing: at corridor ends, at the top of the stairs, in
   the bathroom mirror, through the lobby window. Follow her across six CCTV cameras.
4. **The Truth** — decode the diary's symbols with the study-room blackboard, open the records
   room, find what the warden hid. She now patrols.
5. **Escape** — blackout, emergency lights, locked doors, a full hunt. Return her belongings to
   Room 217 and reach the gate.

Endings: **Good** (escape with the evidence), **Bad** (caught), **Secret** (find out where she has
been all along — look closely at the terrace).

Ghost AI states: IDLE, PATROL, INVESTIGATE, SEARCH, CHASE, ATTACK, RETREAT (+ INSPECT for hiding
spots). She hears footsteps (running is loud, crouching quiet), doors and gasps; sees in a view
cone (further when your flashlight is on); loses you when line of sight breaks; inspects spots she
saw you enter; never enters the safe rooms (214 and the security room); retreats and re-appears
far away instead of teleporting behind you.

## External assets and licenses

**None.** All textures, geometry, the ghost, fonts' usage aside, every sound effect and all music
are generated in code at runtime. Third-party code and fonts:

| Item                                            | License                   |
| ----------------------------------------------- | ------------------------- |
| three.js                                        | MIT                       |
| Capacitor (@capacitor/core, android, app, cli)  | MIT                       |
| Cormorant Garamond (via @fontsource)            | SIL Open Font License 1.1 |
| Inter (via @fontsource)                         | SIL Open Font License 1.1 |
| Special Elite (via @fontsource)                 | Apache License 2.0        |
| Caveat (via @fontsource)                        | SIL Open Font License 1.1 |
| Vite, Vitest, TypeScript, Playwright (dev only) | MIT / Apache-2.0          |

Names, places and institutions in the game are fictional.

## Performance notes

- **Static batching**: all architecture, permanently locked doors and static props are merged per
  material and per 18 m × storey cell; movable objects (doors, cupboards, beds, fans, lights) are
  collapsed to one mesh per material each.
- **Interior culling**: furniture, doors and decals more than ~26 m away or on another storey are
  hidden every 0.2 s (walls and slabs would hide them anyway).
- Measured with `__hh.dbg.info()` at HIGH: ~290–430 draw calls / 130–145k triangles in rooms and
  corridors, ~650 in the most cluttered view (warden's office, including the flashlight shadow
  pass), ~1,000 when standing outside looking at the whole building.
- **Light pool**: ~75 light fixtures exist, but only 3–8 real point lights are shaded; each frame
  they are assigned to the most relevant lit fixtures near the camera. The shader light count
  never changes, so no recompiles. Emissive tubes + additive halo sprites carry the rest.
- **Shadows**: only the flashlight casts per-frame shadows, and only from props within 9 m —
  architecture is excluded because, with the light at the eye, wall shadows fall where you can't
  see. The moonlight shadow map (which does include architecture) is static and re-rendered only
  on lightning strikes.
- **Textures**: generated in a Web Worker pool at load (no UI freeze), shared GPU textures per
  recipe, ORM packed (AO/roughness/metal in one texture), mipmapped + anisotropic.
- **Rain/ripples**: single instanced draw each, animated entirely on the GPU, culled under roofs
  in the vertex shader.
- **Audio**: buffers synthesised once at 22 kHz; positional loops are pooled (nearest 5 emitters);
  occlusion checks throttled to 5 Hz.
- **Shader warm-up** with `compileAsync` during loading to avoid first-encounter hitches.
- Targets: 60 FPS on desktop at HIGH; MEDIUM (75 % render scale, 512 textures, 4 lights,
  512 shadow map) is the mid-range Android default; LOW (60 % scale, no shadows, 30 FPS cap) for
  older devices. Use `?fps` on device to tune.

## Known limitations

- The ghost is a procedural humanoid (sculpted head, lathe-modelled limbs, ribbon-strand hair,
  shader-driven cloth sway) animated procedurally rather than a skinned, motion-captured model;
  it is convincing in the dark and in motion but simpler than a hand-modelled asset up close.
- No baked global illumination: interiors rely on the light pool, hemisphere fill and AO maps.
- The first floor is closed off (visible behind its grille, reachable only on CCTV).
- Rendering was verified in headless Chromium with a software (SwiftShader) GPU; real-device FPS
  on Android has to be measured on hardware (`?fps`).
- The Android project (`android/`) is generated by Capacitor and not committed; building an APK
  needs the Android SDK, which is not part of this repository.
- Only English text is provided, although all UI strings go through the i18n table.
