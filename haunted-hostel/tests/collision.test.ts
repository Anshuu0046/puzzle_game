import { describe, expect, it } from 'vitest';
import { CollisionWorld, rayBox } from '../src/world/collision';
import { TileNoise } from '../src/core/noise';

describe('collision world', () => {
  const w = new CollisionWorld();
  w.add({ minX: -10, maxX: 10, minY: -0.2, maxY: 0, minZ: -10, maxZ: 10, tag: 'floor' });
  w.add({ minX: 2, maxX: 2.2, minY: 0, maxY: 3, minZ: -5, maxZ: 5, tag: 'wall' });
  const step = w.add({ minX: -3, maxX: -2, minY: 0, maxY: 0.17, minZ: -1, maxZ: 1, opaque: false, tag: 'stairs' });

  it('finds the ground and steps up onto low boxes', () => {
    expect(w.groundHeight(0, 0, 0.28, 0.36)).toBeCloseTo(0);
    expect(w.groundHeight(-2.5, 0, 0.28, 0.36)).toBeCloseTo(0.17);
  });

  it('pushes a cylinder out of a wall', () => {
    const p = { x: 2.0, y: 0, z: 0 };
    w.resolveCylinder(p, 0.28, 1.75, 0.36);
    expect(p.x).toBeLessThanOrEqual(2 - 0.28 + 1e-6);
  });

  it('ignores boxes below the step height', () => {
    const p = { x: -2.1, y: 0, z: 0 };
    expect(w.resolveCylinder(p, 0.28, 1.75, 0.36)).toBe(false);
  });

  it('blocks line of sight through opaque walls only', () => {
    expect(w.segmentBlocked(0, 1.5, 0, 5, 1.5, 0)).toBe(true);
    expect(w.segmentBlocked(0, 1.5, 0, -5, 1.5, 0)).toBe(false);
  });

  it('honours disabled boxes (open doors)', () => {
    step.enabled = false;
    expect(w.groundHeight(-2.5, 0, 0.28, 0.36)).toBeCloseTo(0);
    step.enabled = true;
  });

  it('ray/box slab test', () => {
    const b = { minX: 1, maxX: 2, minY: -1, maxY: 1, minZ: -1, maxZ: 1, enabled: true, opaque: true, tag: '', id: 0 };
    expect(rayBox(0, 0, 0, 1, 0, 0, b)).toBeCloseTo(1);
    expect(rayBox(0, 0, 0, -1, 0, 0, b)).toBe(-1);
  });
});

describe('tileable noise', () => {
  it('tiles seamlessly and stays in range', () => {
    const n = new TileNoise(7);
    for (let i = 0; i < 50; i++) {
      const v = i / 50;
      expect(n.fbm(0, v, 4)).toBeCloseTo(n.fbm(1, v, 4), 5);
      const x = n.fbm(v, 0.3, 8);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});
