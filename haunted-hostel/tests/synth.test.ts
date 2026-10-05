import { describe, expect, it } from 'vitest';
import { SOUNDS, renderSound } from '../src/audio/synth';

describe('procedural audio', () => {
  for (const name of Object.keys(SOUNDS)) {
    it(`renders ${name} without NaNs or clipping`, () => {
      const r = renderSound(name, 8000);
      expect(r.channels.length).toBeGreaterThan(0);
      let peak = 0;
      for (const c of r.channels) {
        expect(c.length).toBeGreaterThan(100);
        for (let i = 0; i < c.length; i++) {
          const v = c[i]!;
          expect(Number.isFinite(v)).toBe(true);
          peak = Math.max(peak, Math.abs(v));
        }
      }
      expect(peak).toBeLessThanOrEqual(1.0001);
      expect(peak).toBeGreaterThan(0.01);
    });
  }
});
