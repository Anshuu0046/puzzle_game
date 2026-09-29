import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.nextU32());
    const seqB = Array.from({ length: 20 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('differs between seeds', () => {
    const a = Array.from({ length: 5 }, ((r) => () => r.nextU32())(new Rng(1)));
    const b = Array.from({ length: 5 }, ((r) => () => r.nextU32())(new Rng(2)));
    expect(a).not.toEqual(b);
  });

  it('can save and restore its state', () => {
    const r = new Rng(7);
    r.nextU32();
    const saved = r.state;
    const expected = [r.nextU32(), r.nextU32()];
    const restored = new Rng(0);
    restored.state = saved;
    expect([restored.nextU32(), restored.nextU32()]).toEqual(expected);
  });

  it('int() stays in range and covers every value', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('int() is roughly uniform', () => {
    const r = new Rng(11);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) counts[r.int(6)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });

  it('rejects invalid bounds', () => {
    const r = new Rng(1);
    expect(() => r.int(0)).toThrow();
    expect(() => r.int(2.5)).toThrow();
    expect(() => r.pick([])).toThrow();
  });

  it('shuffle keeps the same elements', () => {
    const r = new Rng(5);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = r.shuffle([...items]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});
