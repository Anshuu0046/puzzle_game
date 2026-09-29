import { describe, expect, it } from 'vitest';
import { Board } from '../../src/engine';
import { P } from './helpers';

describe('Board', () => {
  it('parses and dumps the text format round-trip', () => {
    const text = 'R O Y\nG # P\n. B R';
    const b = Board.parse(text);
    expect(b.dump()).toBe(text);
    expect(b.rows).toBe(3);
    expect(b.cols).toBe(3);
  });

  it('assigns ids in row-major order', () => {
    const b = Board.parse('R O\nY G');
    expect([P(0, 0), P(0, 1), P(1, 0), P(1, 1)].map((p) => b.get(p)?.id)).toEqual([1, 2, 3, 4]);
  });

  it('treats holes as non-playable and never stores pieces there', () => {
    const b = Board.parse('R #\nY G');
    expect(b.isPlayable(P(0, 1))).toBe(false);
    expect(b.get(P(0, 1))).toBeNull();
    expect(() => b.set(P(0, 1), { id: 9, color: 0 })).toThrow();
    expect(b.positions).toHaveLength(3);
  });

  it('returns null outside the board', () => {
    const b = Board.parse('R O');
    expect(b.get(P(-1, 0))).toBeNull();
    expect(b.get(P(0, 5))).toBeNull();
    expect(b.isPlayable(P(3, 3))).toBe(false);
  });

  it('builds from a level shape', () => {
    const b = Board.fromShape(['#..#', '....']);
    expect(b.positions).toHaveLength(6);
    expect(b.column(0)).toEqual([P(1, 0)]);
    expect(b.column(1)).toEqual([P(0, 1), P(1, 1)]);
  });

  it('rejects ragged shapes and bad tokens', () => {
    expect(() => Board.fromShape(['...', '..'])).toThrow();
    expect(() => Board.parse('R O\nY')).toThrow();
    expect(() => Board.parse('R X')).toThrow();
  });

  it('clone is independent', () => {
    const a = Board.parse('R O\nY G');
    const b = a.clone();
    b.swap(P(0, 0), P(0, 1));
    expect(a.dump()).toBe('R O\nY G');
    expect(b.dump()).toBe('O R\nY G');
  });

  it('reports fullness', () => {
    expect(Board.parse('R O\nY G').isFull()).toBe(true);
    expect(Board.parse('R .\nY G').isFull()).toBe(false);
    expect(Board.parse('R #\nY G').isFull()).toBe(true);
  });
});
