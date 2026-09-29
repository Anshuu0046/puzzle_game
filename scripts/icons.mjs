// Renders public/icons/icon.svg to the PNG sizes browsers and app stores expect.
//   node scripts/icons.mjs
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const TARGETS = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  // Maskable icons need the art inside the central 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage();
for (const t of TARGETS) {
  const inset = Math.round(t.size * t.pad);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#ff7aa8"><div style="padding:${inset}px;width:${t.size}px;height:${t.size}px;box-sizing:border-box">${svg.replace('<svg ', `<svg width="${t.size - inset * 2}" height="${t.size - inset * 2}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: false });
  console.log(`wrote ${t.file}`);
}
await browser.close();
