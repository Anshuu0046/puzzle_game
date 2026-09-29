import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = join(__dirname, '../../src/engine');

describe('engine purity', () => {
  it('has no DOM, Pixi, GSAP, Howler or storage dependencies', () => {
    const forbidden = /from ['"](pixi|gsap|howler)|\b(document|window|localStorage|requestAnimationFrame|HTMLElement)\b/;
    for (const file of readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(ENGINE_DIR, file), 'utf8');
      expect(forbidden.test(source), file).toBe(false);
    }
  });
});
