import type { GoalProgress } from './goals';
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
 * What a special did when it went off. Combos come from swapping two specials, or a Prism Orb with
 * anything:
 * - row / column: Line Blaster; burst: Burst Bomb 3x3; colorClear: Prism Orb on one color
 * - cross: Line + Line (row and column); tripleCross: Line + Burst (3 rows and 3 columns)
 * - megaBurst: Burst + Burst (5x5); prismLines / prismBursts: Prism + Line / Burst turns every piece
 *   of that color into that special, then they all go off; boardWipe: Prism + Prism
 */
export type Effect =
  | 'row'
  | 'column'
  | 'burst'
  | 'colorClear'
  | 'cross'
  | 'tripleCross'
  | 'megaBurst'
  | 'prismLines'
  | 'prismBursts'
  | 'boardWipe';

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
  /** A special went off. `cells` is everything its effect reached (the renderer draws the blast). */
  | {
      readonly type: 'specialActivated';
      readonly cascade: number;
      readonly pos: Pos;
      readonly piece: Piece;
      readonly effect: Effect;
      readonly cells: readonly Pos[];
    }
  /** A piece turned into a special in place (Prism combos). Same id, new special. */
  | { readonly type: 'transformed'; readonly pos: Pos; readonly piece: Piece }
  | { readonly type: 'cleared'; readonly cascade: number; readonly pieces: readonly PlacedPiece[] }
  /** Jelly layers removed by the clear just before; `layers` is what is left on each cell. */
  | { readonly type: 'jellyCleared'; readonly cells: readonly { readonly pos: Pos; readonly layers: number }[] }
  /** Goal progress after a clear step. */
  | { readonly type: 'goals'; readonly goals: readonly GoalProgress[] }
  /** The level is won: leftover moves become Line Blasters (see bonusMove), then everything fires. */
  | { readonly type: 'finale'; readonly moves: number }
  /** One leftover move converted during the finale. */
  | { readonly type: 'bonusMove'; readonly pos: Pos; readonly piece: Piece; readonly movesLeft: number }
  /** A new special appeared at `pos`, made from the matched cells `from`. */
  | { readonly type: 'specialCreated'; readonly cascade: number; readonly pos: Pos; readonly piece: Piece; readonly from: readonly Pos[] }
  | { readonly type: 'fell'; readonly falls: readonly Fall[] }
  | { readonly type: 'spawned'; readonly spawns: readonly Spawn[] }
  | { readonly type: 'scored'; readonly cascade: number; readonly points: number; readonly total: number }
  /** No moves were left, so the pieces were rearranged. */
  | { readonly type: 'shuffled'; readonly moves: readonly ShuffleMove[] };

export type BoardEventType = BoardEvent['type'];
