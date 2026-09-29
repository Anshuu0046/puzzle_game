import type { Ticker } from 'pixi.js';

/**
 * Optional frame-rate readout for testing on real devices: open the game with `?fps`.
 * Shows average FPS and the worst frame time over the last second.
 */
export function mountFpsMeter(ticker: Ticker): void {
  const el = document.createElement('div');
  el.className = 'fps-meter';
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  ticker.add((t) => {
    frames++;
    worst = Math.max(worst, t.deltaMS);
    const now = performance.now();
    if (now - last >= 1000) {
      el.textContent = `${Math.round((frames * 1000) / (now - last))} fps · worst ${worst.toFixed(0)} ms`;
      frames = 0;
      worst = 0;
      last = now;
    }
  });
}
