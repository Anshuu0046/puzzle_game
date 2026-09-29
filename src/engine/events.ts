import type { MatchGroup } from './match';
import type { ShuffleMove } from './shuffle';
import type { Piece, Pos } from './types';

export interface PlacedPiece {
  readonly pos: Pos;
  readonly piece: Piece;
}

export interface Fall {
  readonly piece: Piece;
  readonly from: Pos;
  readonly to: Pos;
}

export interface Spawn {
  readonly piece: Piece;
  readonly to: Pos;
  /** Virtual row above the column's top playable cell where the piece starts falling from. */
  readonly startRow: number;
}

/**
 * Everything that happens on the board, in order. The renderer plays these as an animation
 * timeline and never re-derives rules. `cascade` is 1 for the player's own match and grows with
 * each chain reaction after gravity.
 */
export type BoardEvent =
  | { readonly type: 'swapped'; readonly a: Pos; readonly b: Pos }
  /** No match: the renderer plays the swap and bounces back. The board is unchanged. */
  | { readonly type: 'swapRejected'; readonly a: Pos; readonly b: Pos }
  | { readonly type: 'matched'; readonly cascade: number; readonly groups: readonly MatchGroup[] }
  | { readonly type: 'cleared'; readonly cascade: number; readonly pieces: readonly PlacedPiece[] }
  | { readonly type: 'fell'; readonly falls: readonly Fall[] }
  | { readonly type: 'spawned'; readonly spawns: readonly Spawn[] }
  | { readonly type: 'scored'; readonly cascade: number; readonly points: number; readonly total: number }
  /** No moves were left, so the pieces were rearranged. */
  | { readonly type: 'shuffled'; readonly moves: readonly ShuffleMove[] };

export type BoardEventType = BoardEvent['type'];
