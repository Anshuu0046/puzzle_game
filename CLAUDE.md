# Sugar Bloom — Match-3 Web Game

## Goal
Premium, original match-3 browser game (Candy Crush-style mechanics).
All art, names, characters, and UI must be ORIGINAL. Never copy assets, names, or designs from existing games.

## Theme
Candy-garden world. Glossy jelly sweets, soft pastel backgrounds, bright and friendly.

## Tech stack
- TypeScript (strict) + Vite.
- PixiJS v8 for the game board (WebGL).
- GSAP for tweens/easing. Howler.js for audio.
- Plain HTML/CSS for menus and popups over the canvas.
- Vitest for engine tests. Playwright for screenshots.
- localStorage for save data (wrapped in try/catch).

## Architecture (strict)
- `src/engine/` — pure TS board logic: grid, swap, matching, cascades, specials, scoring, seeded RNG. ZERO DOM/Pixi imports. Fully tested (`tests/engine/`).
- `src/render/` — Pixi scene, sprites, particles, animation queue. No game rules.
- `src/ui/` — menus, HUD, popups, world map.
- `src/data/` — level JSON files (`levels/level-NNN.json`, validated on load), worlds, save system.
- `src/audio/` — procedural synth (pure, tested) rendering all SFX and music; Howler playback.
- Engine emits events (swapped, matched, cleared, fell, spawned, ...). Renderer plays them as a queued animation timeline.

## Core mechanics
- 8x8 grid (level-defined shapes/holes allowed), 6 colors.
- Swap adjacent; invalid swaps bounce back.
- Match 3+ → clear, gravity, refill, cascade.
- Specials (original names): 4-line → Line Blaster, L/T → Burst Bomb, 5-line → Prism Orb. Special + special = unique combos.
- Board never starts with matches. No moves → auto shuffle. Hint after 5s idle.

## Platform
- Responsive: portrait mobile first, scales to desktop. Board always fits the viewport.
- Input: touch drag + mouse drag + tap-tap swap.
- Handle devicePixelRatio for crisp rendering. 60 FPS on mid-range phones.
- Pieces drawn procedurally or as generated SVG textures — no external image hosting.

## Visual quality bar
- Glossy pieces with shine, soft shadows, idle wobble.
- Juice on everything: squash/stretch, particle bursts, screen shake on bombs, original combo words.
- Easing everywhere, no linear motion. Swap ~150ms, falls with gravity + bounce.
- Design system: 1 display font + 1 UI font (Google Fonts with fallbacks), color tokens, 8px grid.

## Verification (after every change)
1. `npm test` — engine tests pass.
2. `npm run build` — no TS errors.
3. `npm run shots` — starts a dev server and captures Playwright screenshots at 390x844 (mobile) and
   1440x900 (desktop) into `screenshots/`. VIEW them and critique against the quality bar.
4. Report each task as DONE / PARTIAL / NOT DONE. Never claim features not visible in screenshots.

## Level balance
- `tests/levels/levels.test.ts` requires every level to be winnable by the greedy hint bot.
- `BALANCE=1 npx vitest run tests/levels/balance.test.ts --disableConsoleIntercept` prints bot win
  rates and scores per level; star thresholds are tuned from the bot's average winning score.

## Rules
- One phase at a time: plan → build → verify → commit → stop.
