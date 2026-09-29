import { describe, expect, it } from 'vitest';
import { Board, bestMove, findMoves, hasMove, isValidSwap } from '../../src/engine';
import { P } from './helpers';

describe('move detection', () => {
  const board = () =>
    Board.parse(`
      R O Y G
      O R Y B
      G B O P`);

  it('accepts a swap that makes a match, in either direction', () => {
    const b = Board.parse('R R O R');
    expect(isValidSwap(b, P(0, 2), P(0, 3))).toBe(true);
    expect(isValidSwap(b, P(0, 3), P(0, 2))).toBe(true);
  });

  it('rejects a swap without a match', () => {
    expect(isValidSwap(board(), P(0, 0), P(0, 1))).toBe(false);
  });

  it('rejects non-adjacent, diagonal, hole and out-of-board swaps', () => {
    const b = Board.parse('R R O R\nY # G B');
    expect(isValidSwap(b, P(0, 0), P(0, 3))).toBe(false);
    expect(isValidSwap(b, P(0, 2), P(1, 3))).toBe(false);
    expect(isValidSwap(b, P(0, 1), P(1, 1))).toBe(false);
    expect(isValidSwap(b, P(0, 3), P(0, 4))).toBe(false);
  });

  it('does not modify the board while checking', () => {
    const b = Board.parse('R R O R');
    isValidSwap(b, P(0, 2), P(0, 3));
    expect(b.dump()).toBe('R R O R');
  });

  it('finds the only move, which completes a vertical line', () => {
    const b = Board.parse(`
      Y O
      Y G
      O Y`);
    expect(findMoves(b)).toEqual([{ a: P(2, 0), b: P(2, 1) }]);
  });

  it('reports when no move exists', () => {
    // Colors follow (row + col) % 3, so no swap can line up three.
    const b = Board.parse(`
      R O Y R
      O Y R O
      Y R O Y
      R O Y R`);
    expect(hasMove(b)).toBe(false);
    expect(findMoves(b)).toEqual([]);
    expect(bestMove(b)).toBeNull();
  });

  it('hint prefers the move that clears the most', () => {
    const b = Board.parse(`
      R R O R R
      G B R B G
      Y O Y B Y`);
    // (1,2)R up into (0,2) makes a 5-line; any 3-move scores less.
    expect(bestMove(b)).toEqual({ a: P(0, 2), b: P(1, 2) });
  });

  it('hint is a valid move and leaves the board untouched', () => {
    const b = Board.parse('R R O R\nG B Y B');
    const hint = bestMove(b);
    expect(hint).not.toBeNull();
    expect(isValidSwap(b, hint!.a, hint!.b)).toBe(true);
    expect(b.dump()).toBe('R R O R\nG B Y B');
  });
});
