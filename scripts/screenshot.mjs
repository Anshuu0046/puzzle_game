// Starts the Vite dev server and walks the whole game at mobile and desktop sizes, through the real
// input layer, saving screenshots to screenshots/ and failing on any check or page error.
//
//   npm run shots            # dev server, seed 12345
//   npm run shots:prod       # production build under its CSP, plus service worker + offline checks
//   SEED=7 npm run shots
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

const SEED = process.env.SEED ?? '12345';
const PROD = process.env.TARGET === 'prod';
const OUT = new URL('../screenshots/', import.meta.url);
const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const LANDSCAPE = { name: 'landscape', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

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

// Plain board with one obvious move: (7,2) O down... swap (6,2)<->(7,2) makes R R R on row 7.
const PLAIN = `
  G B P O Y G B P
  B P O Y G B P O
  P O Y G B P O Y
  O Y G B P O Y G
  Y G B P O Y G B
  G B P O Y G B P
  B P R O Y G B P
  R R O G B P O Y`;

async function launch() {
  const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ args });
  } catch {
    // Fall back to a preinstalled Chromium when Playwright's own build isn't downloaded.
    return chromium.launch({ args, executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
  }
}

async function run() {
  await mkdir(OUT, { recursive: true });
  let server;
  if (PROD) {
    await build({ logLevel: 'error' });
    server = await preview({ preview: { port: 4199, strictPort: false }, logLevel: 'error' });
  } else {
    server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
    await server.listen();
  }
  const prefix = PROD ? 'prod-' : '';
  const url = `${server.resolvedUrls.local[0]}?e2e&seed=${SEED}`;
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
      page.on('requestfailed', (r) => console.log(`${vp.name}: request failed ${r.url()} (${r.failure()?.errorText})`));

      let step = 0;
      const shot = async (label) => {
        step++;
        await page.screenshot({ path: new URL(`${prefix}${vp.name}-${String(step).padStart(2, '0')}-${label}.png`, OUT).pathname });
      };
      const check = (label, ok, detail = '') => {
        console.log(`${vp.name}: ${label} ${ok ? 'OK' : 'FAILED'}${detail ? ` (${detail})` : ''}`);
        failed ||= !ok;
      };
      const waitIdle = () => page.waitForFunction(() => window.__sugarBloom?.isIdle() === true, null, { timeout: 20000 });
      const swap = async (a, b) => {
        const [pa, pb] = await page.evaluate(
          ([x, y]) => [window.__sugarBloom.cellToClient(x), window.__sugarBloom.cellToClient(y)],
          [a, b],
        );
        if (vp.hasTouch) {
          // Tap-tap on touch screens.
          await page.touchscreen.tap(pa.x, pa.y);
          await page.touchscreen.tap(pb.x, pb.y);
          return;
        }
        // Drag with the mouse on desktop.
        await page.mouse.move(pa.x, pa.y);
        await page.mouse.down();
        await page.mouse.move(pb.x, pb.y, { steps: 6 });
        await page.mouse.up();
      };
      const button = (name) => page.getByRole('button', { name, exact: true });
      const modal = (label) => page.locator(`.modal--open[aria-label="${label}"]`);

      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__sugarBloom !== undefined, null, { timeout: 15000 });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__sugarBloom !== undefined, null, { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      await shot('title');

      await button('Play').click();
      await page.waitForTimeout(400);
      await shot('map');
      check(
        'map shows 30 levels, 1 unlocked',
        (await page.locator('.map-node').count()) === 30 && (await page.locator('.map-node:not([disabled])').count()) === 1,
      );

      await button('Level 1').click();
      await modal('Level 1').waitFor();
      await page.waitForTimeout(450);
      await shot('intro');

      await button('Play').click();
      await page.waitForTimeout(500);
      await waitIdle();
      await shot('level');

      const audio = await page.evaluate(() => window.__sugarBloom.audioLoaded());
      check('audio', audio.total > 0 && audio.loaded === audio.total, `${audio.loaded}/${audio.total} effects decoded`);

      const before = await page.evaluate(() => {
        const g = window.__sugarBloom.game;
        return { score: g.score, moves: g.movesLeft, hint: g.hint() };
      });
      await swap(before.hint.a, before.hint.b);
      await page.waitForTimeout(260);
      await shot('swap-mid');
      await waitIdle();
      await page.waitForTimeout(700);
      await shot('swap-after');
      const after = await page.evaluate(() => ({
        score: window.__sugarBloom.game.score,
        moves: window.__sugarBloom.game.movesLeft,
        hudMoves: document.querySelector('.hud__moves .hud__value')?.textContent,
        hudScore: document.querySelector('.hud__score .hud__value')?.textContent,
      }));
      check(
        'swap through input',
        after.moves === before.moves - 1 && after.score > before.score,
        `moves ${before.moves}→${after.moves}, score ${before.score}→${after.score}`,
      );
      check(
        'HUD in sync',
        after.hudMoves === String(after.moves) && after.hudScore === after.score.toLocaleString('en-US'),
        `${after.hudMoves} / ${after.hudScore}`,
      );

      await page.getByRole('button', { name: 'Pause' }).click();
      await modal('Paused').waitFor();
      await page.waitForTimeout(450);
      await shot('pause');
      await button('Resume').click();
      await page.waitForTimeout(300);

      if (!vp.hasTouch) {
        // Keyboard play on a scripted board: arrows to (6,2), Enter, ArrowDown, Enter swaps it with (7,2).
        await page.evaluate((text) => window.__sugarBloom.loadBoard(text, 2), PLAIN);
        const movesBefore = await page.evaluate(() => window.__sugarBloom.game.movesLeft);
        await page.keyboard.press('ArrowDown'); // first press shows the cursor at the top-left
        for (let r = 0; r < 6; r++) await page.keyboard.press('ArrowDown');
        for (let c = 0; c < 2; c++) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowDown');
        await shot('keyboard');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        await waitIdle();
        const movesAfter = await page.evaluate(() => window.__sugarBloom.game.movesLeft);
        check('keyboard swap', movesAfter === movesBefore - 1, `moves ${movesBefore}→${movesAfter}`);
      }

      // Hint on a board with every special.
      await page.evaluate((text) => window.__sugarBloom.loadBoard(text, 1), SHOWCASE);
      await page.evaluate(() => window.__sugarBloom.showHint());
      await page.waitForTimeout(350);
      await shot('specials-hint');

      // Line + Burst combo: mid-blast, the finale, then the result card.
      await page.evaluate((text) => window.__sugarBloom.loadBoard(text, 1), SHOWCASE);
      await swap({ row: 3, col: 4 }, { row: 3, col: 3 });
      await page.waitForTimeout(240);
      await shot('combo');
      await page.waitForFunction(() => window.__sugarBloom.game?.status === 'won', null, { timeout: 20000 });
      await page.waitForFunction(() => window.__sugarBloom.game?.canFinale === false, null, { timeout: 20000 });
      await page.waitForTimeout(700);
      await shot('finale');
      // Tap to fast-forward the finale.
      const t0 = Date.now();
      if (vp.hasTouch) await page.touchscreen.tap(20, 800);
      else await page.mouse.click(20, 800);
      await modal('Level complete').waitFor({ timeout: 60000 });
      console.log(`${vp.name}: finale finished ${((Date.now() - t0) / 1000).toFixed(1)}s after skip tap`);
      await page.waitForTimeout(1800);
      await shot('win');
      const stars = await page.locator('.modal--open .stars__full').count();
      check('win card with stars', stars >= 1, `${stars} stars`);

      await button('Next level').click();
      await modal('Level 2').waitFor();
      await button('Back to map').click();
      await page.waitForTimeout(500);
      await shot('map-progress');
      check('level 2 unlocked after win', (await page.locator('.map-node:not([disabled])').count()) === 2);

      // A jelly level.
      await page.evaluate(() => window.__sugarBloom.app.openLevel(4, true));
      await page.waitForTimeout(600);
      await waitIdle();
      await shot('jelly-level');

      // A loss: one move left and the goal far away.
      await page.evaluate((text) => window.__sugarBloom.loadBoard(text, 2, 1), PLAIN);
      await swap({ row: 6, col: 2 }, { row: 7, col: 2 });
      await modal('Out of moves').waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      await shot('lose');
      check('lose card', true);

      if (PROD) {
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload({ waitUntil: 'networkidle' });
        const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
        check('service worker controls the page', controlled);
        await context.setOffline(true);
        await page.reload({ waitUntil: 'load' }).catch(() => undefined);
        const offline = await page
          .waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 15000 })
          .then(() => true)
          .catch(() => false);
        if (offline) await shot('offline');
        check('loads offline', offline);
        await context.setOffline(false);
      }

      if (errors.length) console.log(`${vp.name}: page errors:\n  ${errors.join('\n  ')}`);
      failed ||= errors.length > 0;
      await context.close();
    }

    // Landscape phone: the board must still fit under the HUD.
    const context = await browser.newContext({ ...LANDSCAPE, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__sugarBloom !== undefined, null, { timeout: 15000 });
    await page.evaluate(() => window.__sugarBloom.app.openLevel(1, true));
    await page.waitForTimeout(800);
    await page.screenshot({ path: new URL(`${prefix}landscape-level.png`, OUT).pathname });
    const fits = await page.evaluate(() => {
      const top = window.__sugarBloom.cellToClient({ row: 0, col: 0 });
      const bottom = window.__sugarBloom.cellToClient({ row: 7, col: 7 });
      const hud = document.getElementById('hud').getBoundingClientRect().bottom;
      return top.y > hud && bottom.y < innerHeight && bottom.x < innerWidth;
    });
    console.log(`landscape: board fits ${fits ? 'OK' : 'FAILED'}`);
    failed ||= !fits;
    await context.close();
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
