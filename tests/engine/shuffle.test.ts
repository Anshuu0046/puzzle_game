import { describe, expect, it } from 'vitest';
import { Board, Rng, hasMatch, hasMove, shuffleBoard } from '../../src/engine';

const DEAD = `
  R O Y R O
  O Y R O Y
  Y R O Y R
  R O Y R O
  O Y R O Y`;

describe('shuffle', () => {
  it('turns a dead board into a playable one with the same pieces', () => {
    const before = Board.parse(DEAD);
    expect(hasMove(before)).toBe(false);
    const board = before.clone();
    const moves = shuffleBoard(board, [0, 1, 2], new Rng(4));
    expect(hasMatch(board)).toBe(false);
    expect(hasMove(board)).toBe(true);
    const idsBefore = before.pieces().map(({ piece }) => piece.id).sort((a, b) => a - b);
    const idsAfter = board.pieces().map(({ piece }) => piece.id).sort((a, b) => a - b);
    expect(idsAfter).toEqual(idsBefore);
    expect(moves).toHaveLength(25);
  });

  it('reports where every piece went', () => {
    const before = Board.parse(DEAD);
    const board = before.clone();
    for (const m of shuffleBoard(board, [0, 1, 2], new Rng(8))) {
      expect(before.get(m.from)?.id).toBe(m.piece.id);
      expect(board.get(m.to)).toEqual(m.piece);
    }
  });

  it('keeps holes empty', () => {
    const board = Board.parse(`
      R O Y R
      O # R O
      Y R O Y
      R O # R`);
    shuffleBoard(board, [0, 1, 2], new Rng(2));
    expect(board.get({ row: 1, col: 1 })).toBeNull();
    expect(board.get({ row: 3, col: 2 })).toBeNull();
    expect(board.isFull()).toBe(true);
  });

  it('recolors when no arrangement of the pieces can work', () => {
    // Four pieces of four different colors can never make a match, whatever the order.
    const board = Board.parse('R O Y G');
    const moves = shuffleBoard(board, [0, 1, 2], new Rng(1));
    expect(hasMove(board)).toBe(true);
    expect(hasMatch(board)).toBe(false);
    expect(moves.map((m) => m.piece.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it('throws for a shape that can never be playable', () => {
    expect(() => shuffleBoard(Board.parse('R O'), [0, 1, 2], new Rng(1))).toThrow();
  });
});
