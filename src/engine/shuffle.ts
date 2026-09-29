import type { Board } from './board';
import { fillWithoutMatches } from './generate';
import { hasMatch } from './match';
import { hasMove } from './moves';
import type { Rng } from './rng';
import type { Color, Piece, Pos } from './types';

export interface ShuffleMove {
  readonly from: Pos;
  readonly to: Pos;
  /** The piece after the shuffle. Same id; the color only differs if a recolor was needed. */
  readonly piece: Piece;
}

const PERMUTE_ATTEMPTS = 200;
const RECOLOR_ATTEMPTS = 200;

/**
 * Rearranges the pieces already on the board into a layout with no matches and at least one move.
 * If no permutation works (tiny or awkward shapes), pieces keep their shuffled spots but get new
 * colors. Throws if the shape cannot support a playable board at all.
 */
export function shuffleBoard(board: Board, colors: readonly Color[], rng: Rng): ShuffleMove[] {
  const origin = new Map<number, Pos>();
  for (const { pos, piece } of board.pieces()) origin.set(piece.id, pos);
  const slots = board.positions.filter((p) => board.get(p) !== null);
  const pieces = slots.map((p) => board.get(p)!);

  const place = (order: Piece[]) => slots.forEach((p, i) => board.set(p, order[i]!));

  let ok = false;
  for (let i = 0; i < PERMUTE_ATTEMPTS && !ok; i++) {
    place(rng.shuffle([...pieces]));
    ok = !hasMatch(board) && hasMove(board);
  }
  const ids = slots.map((p) => board.get(p)!.id);
  for (let i = 0; i < RECOLOR_ATTEMPTS && !ok; i++) {
    slots.forEach((p) => board.set(p, null));
    const filled = fillWithoutMatches(board, colors, rng, (p, color) => ({ id: ids[slots.indexOf(p)]!, color }));
    ok = filled && hasMove(board);
  }
  if (!ok) throw new Error('board shape cannot be shuffled into a playable layout');

  return slots.map((to) => {
    const piece = board.get(to)!;
    return { from: origin.get(piece.id)!, to, piece };
  });
}
