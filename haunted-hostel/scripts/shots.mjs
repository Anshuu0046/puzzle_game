// UI screenshots on desktop and phone viewports: menu, settings, HUD + touch controls, inventory,
// document reader, phone, CCTV. Usage: node scripts/shots.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5174/';
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const errors = [];

async function session(name, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${BASE}?autostart&debug${touch ? '&touch' : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForFunction(() => document.querySelector('.menu'), null, { timeout: 60000 });
  const shot = async (n) => {
    await page.evaluate(() => {
      const s = __hh.simOnly;
      __hh.simOnly = 0;
      __hh.update(0.016);
      __hh.dbg.frame();
      __hh.simOnly = s;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/${name}-${n}.png` });
  };
  await page.evaluate(() => document.querySelector('.rotate-hint')?.remove());
  await page.waitForTimeout(800);
  await shot('menu');
  await page.evaluate(() => [...document.querySelectorAll('.hh-btn')].find((b) => b.textContent.trim() === 'SETTINGS').click());
  await page.waitForTimeout(500);
  await shot('settings');
  await page.evaluate(() => [...document.querySelectorAll('.hh-btn')].find((b) => b.textContent.trim() === 'BACK').click());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    __hh.dbg.sim(4);
    __hh.newGame();
  });
  await page.waitForFunction(() => __hh.mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    __hh.dbg.tp(18, 0, 12, 0);
    __hh.dbg.sim(0);
  });
  await shot('hud-courtyard');
  // Second floor corridor with the power on.
  await page.evaluate(() => {
    __hh.dbg.sim(4);
    __hh.dbg.act('keyboard');
    __hh.dbg.flag('power');
    __hh.dbg.power('GF', true);
    __hh.dbg.power('SF', true);
    __hh.dbg.tp(9.0, 6.8, 0, -Math.PI / 2);
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => __hh.dbg.sim(0));
  await shot('corridor');
  await page.evaluate(() => {
    __hh.dbg.sim(4);
    __hh.dbg.tpPoint('room214', Math.PI);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => __hh.dbg.sim(0));
  await shot('room214');
  await page.evaluate(() => __hh.openInventory());
  await page.waitForTimeout(600);
  await shot('inventory');
  await page.evaluate(() => document.querySelector('.inventory .hh-btn.small:last-child')?.click());
  await page.evaluate(() => __hh.resumePlay());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    __hh.mode = 'play';
    __hh.readDocument('diary');
  });
  await page.waitForTimeout(600);
  await shot('document');
  await page.evaluate(() => [...document.querySelectorAll('.doc-nav button')].find((b) => b.textContent.trim() === 'CLOSE').click());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    __hh.phone.receive('Unknown', 'Are you still in Room 217?', true);
    __hh.openPhone();
  });
  await page.waitForTimeout(600);
  await shot('phone');
  await page.evaluate(() => __hh.phone.close());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    __hh.dbg.tpPoint('cctv-view', -Math.PI / 2);
    __hh.cctv.show();
    __hh.mode = 'cctv';
    __hh.cctv.select(4);
    __hh.cctv.update(0.1);
  });
  await page.waitForTimeout(400);
  await shot('cctv');
  await ctx.close();
}

await session('desktop', { width: 1440, height: 900 }, false);
await session('mobile-landscape', { width: 844, height: 390 }, true);
await session('mobile-portrait', { width: 390, height: 844 }, true);
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('screenshots written to screenshots/');
