import type { Board } from './board';
import { findGroups, isInMatch } from './match';
import { isComboSwap } from './resolve';
import { type Color, type Move, type Pos, isAdjacent, pos, samePos } from './types';

/** What the player still needs, so hints favor useful moves. */
export interface HintFocus {
  readonly jelly: boolean;
  readonly colors: readonly Color[];
}

/**
 * True if swapping a and b is a legal move: adjacent, both hold pieces, and either a match results
 * or it is a combo swap (any Prism Orb, or two specials).
 */
export function isValidSwap(board: Board, a: Pos, b: Pos): boolean {
  const pa = board.get(a);
  const pb = board.get(b);
  if (!isAdjacent(a, b) || !pa || !pb) return false;
  if (isComboSwap(pa, pb)) return true;
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

const SPECIAL_VALUE = { none: 0, lineBlaster: 40, burstBomb: 60, prismOrb: 100 } as const;

/** Rough immediate value of a legal move, used to pick hints. */
export function moveValue(board: Board, move: Move, focus?: HintFocus): number {
  const pa = board.get(move.a)!;
  const pb = board.get(move.b)!;
  if (isComboSwap(pa, pb)) {
    const prisms = [pa, pb].filter((p) => p.special === 'prism').length;
    const specials = [pa, pb].filter((p) => p.special !== 'none').length;
    return 200 + prisms * 300 + specials * 100;
  }
  board.swap(move.a, move.b);
  const value = findGroups(board)
    .filter((g) => g.cells.some((p) => samePos(p, move.a) || samePos(p, move.b)))
    .reduce((sum, g) => {
      let value = g.cells.length * 10 + SPECIAL_VALUE[g.special] + g.cells.filter((p) => board.get(p)!.special !== 'none').length * 30;
      if (focus?.jelly) value += g.cells.reduce((n, p) => n + board.jelly(p) * 25, 0);
      if (focus?.colors.includes(g.color)) value += g.cells.length * 15;
      // Lower matches shake up more of the board.
      value += g.cells.reduce((n, p) => n + p.row, 0);
      return sum + value;
    }, 0);
  board.swap(move.a, move.b);
  return value;
}

/** The move to suggest as a hint: highest immediate value, ties broken by board order. */
export function bestMove(board: Board, focus?: HintFocus): Move | null {
  const work = board.clone();
  let best: Move | null = null;
  let bestValue = -1;
  for (const move of findMoves(work)) {
    const value = moveValue(work, move, focus);
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
  }
  return best;
}
