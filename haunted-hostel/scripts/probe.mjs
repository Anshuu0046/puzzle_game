// Ad-hoc probe: node scripts/probe.mjs out.png "<js to run after menu>" [w h] [waitMs]
import { chromium } from 'playwright';
const [out = 'screenshots/probe.png', js = '', w = '1280', h = '720', wait = '2500', query = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => {
  const t = m.text();
  if (!t.startsWith('[vite]')) console.log('[page]', t.slice(0, 400));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.slice(0, 600)));
await page.goto(`http://127.0.0.1:5174/?autostart&debug${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
await page.waitForTimeout(1500);
if (js) {
  const r = await page.evaluate(js);
  if (r !== undefined) console.log('result:', JSON.stringify(r).slice(0, 2000));
}
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
