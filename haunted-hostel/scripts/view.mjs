// Quick viewer: node scripts/view.mjs "x,y,z,yaw,pitch" out.png [w h]
import { chromium } from 'playwright';
const [cam = '20,8.4,0,1.57,0', out = 'screenshots/view.png', w = '1280', h = '720', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5174/?cam=${cam}${extra}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 400000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
await browser.close();
