import { describe, expect, it } from 'vitest';
import { IdSource, Rng, generateBoard, hasMatch, hasMove } from '../../src/engine';
import { EIGHT_BY_EIGHT } from './helpers';

const SIX = [0, 1, 2, 3, 4, 5];

describe('board generation', () => {
  it('never starts with a match and always has a move (500 seeds)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const b = generateBoard(EIGHT_BY_EIGHT, SIX, new Rng(seed), new IdSource());
      expect(hasMatch(b), `seed ${seed}`).toBe(false);
      expect(hasMove(b), `seed ${seed}`).toBe(true);
      expect(b.isFull()).toBe(true);
    }
  });

  it('is deterministic per seed', () => {
    const a = generateBoard(EIGHT_BY_EIGHT, SIX, new Rng(99), new IdSource());
    const b = generateBoard(EIGHT_BY_EIGHT, SIX, new Rng(99), new IdSource());
    const c = generateBoard(EIGHT_BY_EIGHT, SIX, new Rng(100), new IdSource());
    expect(a.dump()).toBe(b.dump());
    expect(a.dump()).not.toBe(c.dump());
  });

  it('respects level shapes with holes', () => {
    const shape = ['##....##', '#......#', '........', '...##...', '...##...', '........', '#......#', '##....##'];
    for (let seed = 1; seed <= 50; seed++) {
      const b = generateBoard(shape, SIX, new Rng(seed), new IdSource());
      expect(b.positions).toHaveLength(64 - 16);
      expect(b.isFull()).toBe(true);
      expect(hasMatch(b)).toBe(false);
      expect(hasMove(b)).toBe(true);
      expect(b.get({ row: 0, col: 0 })).toBeNull();
      expect(b.get({ row: 3, col: 3 })).toBeNull();
    }
  });

  it('only uses the level palette', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = generateBoard(EIGHT_BY_EIGHT, [0, 1, 2, 3], new Rng(seed), new IdSource());
      expect(b.pieces().every(({ piece }) => (piece.color ?? 0) <= 3)).toBe(true);
      expect(hasMatch(b)).toBe(false);
    }
  });

  it('works with the minimum of 3 colors', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = generateBoard(EIGHT_BY_EIGHT, [0, 1, 2], new Rng(seed), new IdSource());
      expect(hasMatch(b)).toBe(false);
      expect(hasMove(b)).toBe(true);
    }
  });

  it('gives every piece a unique id', () => {
    const b = generateBoard(EIGHT_BY_EIGHT, SIX, new Rng(5), new IdSource());
    const ids = b.pieces().map(({ piece }) => piece.id);
    expect(new Set(ids).size).toBe(64);
  });

  it('rejects fewer than 3 colors', () => {
    expect(() => generateBoard(EIGHT_BY_EIGHT, [0, 1], new Rng(1), new IdSource())).toThrow();
  });
});
