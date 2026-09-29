# Sugar Bloom

A candy-garden match-3 puzzle game for the browser. Swap glossy sweets, build Line Blasters, Burst
Bombs and Prism Orbs, and bring three gardens into bloom across 30 levels. All art, sound and music
are generated in code — there are no image or audio files.

## Play locally

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | Vitest: engine rules, levels (bot must be able to win each), save system, audio synth |
| `npm run build` | Type-check (`tsc --noEmit`) and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run shots` | Playwright walk-through at 390×844 and 1440×900, screenshots into `screenshots/` |

Level tuning report: `BALANCE=1 npx vitest run tests/levels/balance.test.ts --disableConsoleIntercept`.

## How it fits together

```
src/engine   pure TypeScript rules: board, matching, specials, combos, cascades, goals, finale,
             seeded RNG. No DOM. Every turn returns an ordered list of events.
src/render   PixiJS board: plays engine events as a GSAP animation queue, particles, blast FX.
src/ui       HTML/CSS screens: title, world map, HUD, popups. Owns the game flow.
src/audio    tiny offline synth → WAV blobs → Howler. SFX and a looping garden tune.
src/data     level JSON (validated on load), worlds, localStorage save (versioned, guarded).
```

The renderer never decides anything: it replays what the engine reports. Tests replay the same
events onto a copy of the board and require an exact match, so the animation timeline can't drift
from the rules.

## Game rules

- Swap two neighbors to line up 3+ of a color. No match → the swap bounces back.
- 4 in a line → **Line Blaster** (clears a row or column). L/T/+ → **Burst Bomb** (3×3).
  5 in a line → **Prism Orb** (clears every piece of one color).
- Swap two specials, or a Prism Orb with anything, for a combo: Criss-Cross, Candy Storm,
  Bloom Boom, Rainbow Rush, Garden Glory.
- Goals: reach a score, collect sweets of a color, or clear all jelly. Leftover moves become
  Line Blasters in the **Bloom Bonus** finale.
- No moves left → the board shuffles itself. Idle for 5 seconds → a hint.

## Deploying

`npm run build` produces a static site in `dist/` with relative asset paths, so it can be hosted
from any path (GitHub Pages, Netlify, S3, itch.io). It is an installable PWA that works offline
after the first visit.
