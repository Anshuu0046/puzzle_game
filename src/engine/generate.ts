import { Board } from './board';
import { isInMatch } from './match';
import { hasMove } from './moves';
import type { Rng } from './rng';
import { type Color, type Piece, type Pos, plain } from './types';

const MAX_ATTEMPTS = 500;
const PROBE_ID = -1;

/** Hands out unique piece ids for a game. */
export class IdSource {
  constructor(public nextId = 1) {}
  next(): number {
    return this.nextId++;
  }
}

/** A board of the given shape with no matches and at least one legal move. */
export function generateBoard(shape: readonly string[], colors: readonly Color[], rng: Rng, ids: IdSource): Board {
  if (colors.length < 3) throw new RangeError('at least 3 colors are needed to avoid starting matches');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const board = Board.fromShape(shape);
    if (fillWithoutMatches(board, colors, rng, (_, color) => plain(ids.next(), color)) && hasMove(board)) {
      return board;
    }
  }
  throw new Error('could not generate a playable board for this shape');
}

/**
 * Fills every empty playable cell, row-major, with a color that does not complete a match.
 * Returns false (leaving the board partially filled) if some cell had no safe color.
 */
export function fillWithoutMatches(
  board: Board,
  colors: readonly Color[],
  rng: Rng,
  makePiece: (p: Pos, color: Color) => Piece,
): boolean {
  for (const p of board.positions) {
    if (board.get(p)) continue;
    const safe = rng.shuffle([...colors]).find((color) => {
      board.set(p, plain(PROBE_ID, color));
      return !isInMatch(board, p);
    });
    if (safe === undefined) {
      board.set(p, null);
      return false;
    }
    board.set(p, makePiece(p, safe));
  }
  return true;
}
