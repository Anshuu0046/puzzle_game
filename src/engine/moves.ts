import type { Board } from './board';
import { findGroups, isInMatch } from './match';
import { type Move, type Pos, isAdjacent, pos } from './types';

/** True if swapping a and b is a legal move: adjacent, both hold pieces, and a match results. */
export function isValidSwap(board: Board, a: Pos, b: Pos): boolean {
  if (!isAdjacent(a, b) || !board.get(a) || !board.get(b)) return false;
  board.swap(a, b);
  const ok = isInMatch(board, a) || isInMatch(board, b);
  board.swap(a, b);
  return ok;
}

/** Every legal move, scanning right and down neighbors in row-major order. */
export function findMoves(board: Board): Move[] {
  const work = board.clone();
  const moves: Move[] = [];
  for (const a of work.positions) {
    for (const b of [pos(a.row, a.col + 1), pos(a.row + 1, a.col)]) {
      if (isValidSwap(work, a, b)) moves.push({ a, b });
    }
  }
  return moves;
}

export function hasMove(board: Board): boolean {
  const work = board.clone();
  for (const a of work.positions) {
    if (isValidSwap(work, a, pos(a.row, a.col + 1)) || isValidSwap(work, a, pos(a.row + 1, a.col))) return true;
  }
  return false;
}

/**
 * The move to suggest as a hint: the one that clears the most cells right away (bigger shapes
 * first), ties broken by board order so hints are stable.
 */
export function bestMove(board: Board): Move | null {
  const work = board.clone();
  let best: Move | null = null;
  let bestValue = -1;
  for (const move of findMoves(work)) {
    work.swap(move.a, move.b);
    const value = findGroups(work)
      .filter((g) => g.cells.some((p) => (p.row === move.a.row && p.col === move.a.col) || (p.row === move.b.row && p.col === move.b.col)))
      .reduce((sum, g) => sum + g.cells.length * 10 + (g.special === 'none' ? 0 : 25), 0);
    work.swap(move.a, move.b);
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
  }
  return best;
}
