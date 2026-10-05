import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/special-elite/400.css';
import '@fontsource/caveat/500.css';
import './ui/styles.css';
import { Game } from './game/game';

function fatal(err: unknown): void {
  console.error(err);
  const msg = err instanceof Error ? err.message : String(err);
  const el = document.createElement('div');
  el.setAttribute(
    'style',
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#050505;color:#e6dfcc;font:14px Inter,Arial;text-align:center;padding:24px;z-index:99',
  );
  el.innerHTML = `<div style="font:600 28px Georgia;letter-spacing:.3em">HAUNTED HOSTEL</div><div>Something went wrong while starting the game.</div><code style="color:#c4362a;max-width:90vw;overflow:auto">${msg.replace(/</g, '&lt;')}</code><div style="color:#8f887a">Make sure WebGL is enabled, then reload.</div>`;
  document.body.append(el);
}

window.addEventListener('error', (e) => console.error('Uncaught', e.error ?? e.message));

if (!document.createElement('canvas').getContext('webgl2')) {
  fatal(new Error('WebGL 2 is not available on this device/browser.'));
} else {
  new Game().boot().catch(fatal);
}
