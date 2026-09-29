// Starts the Vite dev server, opens the game at mobile and desktop sizes, plays one real swap through
// the input layer (tap-tap on mobile, mouse drag on desktop) and saves screenshots to screenshots/.
//
//   npm run shots            # seed 12345
//   SEED=7 npm run shots
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const SEED = process.env.SEED ?? '12345';
const OUT = new URL('../screenshots/', import.meta.url);
const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

async function launch() {
  const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ args });
  } catch {
    // Fall back to a preinstalled Chromium when Playwright's own build isn't downloaded.
    return chromium.launch({ args, executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
  }
}

// Every special on one board, no matches. (3,4) Line Blaster + (3,3) Burst Bomb is a combo.
const SHOWCASE = `
  R O Y G B P R O
  O R- Y| G* B P O R
  Y G @ B P R O Y
  G B P R* O- Y G B
  B P R O Y G B| P
  P R O Y G B P R
  R O* G B P R O Y
  O Y B P R O Y G`;

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** Staged board: all special pieces, a Line + Burst combo mid-blast, and the idle hint. */
async function specialsScenario(page, name) {
  await page.evaluate((text) => window.__sugarBloom.loadBoard(text), SHOWCASE);
  await page.waitForTimeout(300);
  await page.screenshot({ path: new URL(`${name}-5-specials.png`, OUT).pathname });

  const [from, to] = await page.evaluate(() => [
    window.__sugarBloom.cellToClient({ row: 3, col: 4 }),
    window.__sugarBloom.cellToClient({ row: 3, col: 3 }),
  ]);
  const before = await page.evaluate(() => window.__sugarBloom.game.score);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    await page.touchscreen.tap(from.x, from.y);
    await page.touchscreen.tap(to.x, to.y);
  } else {
    await drag(page, from, to);
  }
  await page.waitForTimeout(230);
  await page.screenshot({ path: new URL(`${name}-6-combo.png`, OUT).pathname });
  await waitIdle(page);
  const after = await page.evaluate(() => window.__sugarBloom.game.score);

  await page.evaluate((text) => window.__sugarBloom.loadBoard(text), SHOWCASE);
  await page.evaluate(() => window.__sugarBloom.showHint());
  await page.waitForTimeout(330);
  await page.screenshot({ path: new URL(`${name}-7-hint.png`, OUT).pathname });
  return after > before;
}

const waitIdle = (page) => page.waitForFunction(() => window.__sugarBloom?.isIdle() === true, null, { timeout: 15000 });

async function run() {
  await mkdir(OUT, { recursive: true });
  const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}?seed=${SEED}`;
  const browser = await launch();
  let failed = false;

  try {
    for (const vp of VIEWPORTS) {
      // The sandbox HTTPS proxy re-signs Google Fonts; without this the screenshots show fallback fonts.
      const context = await browser.newContext({ ...vp, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
      // Network failures are reported separately: external fonts can flake in sandboxes and have fallbacks.
      page.on('requestfailed', (r) => console.log(`${vp.name}: request failed ${r.url()} (${r.failure()?.errorText})`));

      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__sugarBloom !== undefined, null, { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await waitIdle(page);
      await page.screenshot({ path: new URL(`${vp.name}-1-start.png`, OUT).pathname });

      const before = await page.evaluate(() => {
        const g = window.__sugarBloom.game;
        const hint = g.hint();
        return {
          score: g.score,
          moves: g.movesLeft,
          a: window.__sugarBloom.cellToClient(hint.a),
          b: window.__sugarBloom.cellToClient(hint.b),
        };
      });

      if (vp.hasTouch) {
        await page.touchscreen.tap(before.a.x, before.a.y);
        await page.waitForTimeout(250);
        await page.screenshot({ path: new URL(`${vp.name}-2-selected.png`, OUT).pathname });
        await page.touchscreen.tap(before.b.x, before.b.y);
      } else {
        await drag(page, before.a, before.b);
      }
      await page.waitForTimeout(260);
      await page.screenshot({ path: new URL(`${vp.name}-3-mid.png`, OUT).pathname });
      await waitIdle(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: new URL(`${vp.name}-4-after.png`, OUT).pathname });

      const after = await page.evaluate(() => ({
        score: window.__sugarBloom.game.score,
        moves: window.__sugarBloom.game.movesLeft,
        hudScore: document.querySelector('[data-score]')?.textContent,
        hudMoves: document.querySelector('[data-moves]')?.textContent,
      }));
      const swapped = after.moves === before.moves - 1 && after.score > before.score;
      const hudOk = after.hudMoves === String(after.moves) && after.hudScore === after.score.toLocaleString('en-US');
      console.log(
        `${vp.name}: swap ${swapped ? 'OK' : 'FAILED'} (moves ${before.moves}→${after.moves}, score ${before.score}→${after.score}), ` +
          `HUD ${hudOk ? 'OK' : 'MISMATCH'} (${after.hudMoves} / ${after.hudScore})`,
      );
      if (errors.length) console.log(`${vp.name}: page errors:\n  ${errors.join('\n  ')}`);
      const comboOk = await specialsScenario(page, vp.name);
      console.log(`${vp.name}: special combo ${comboOk ? 'OK' : 'FAILED'}`);
      failed ||= !swapped || !hudOk || !comboOk || errors.length > 0;
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`screenshots written to ${OUT.pathname}`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
