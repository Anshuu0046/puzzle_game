import type { Board } from './board';
import type { BoardEvent } from './events';
import { IdSource, generateBoard } from './generate';
import { isInMatch } from './match';
import { bestMove, hasMove } from './moves';
import { Rng } from './rng';
import { Resolver, isComboSwap } from './resolve';
import { shuffleBoard } from './shuffle';
import { type Color, MAX_COLORS, type Move, type Pos, isAdjacent } from './types';

export interface LevelConfig {
  readonly id: number;
  readonly name: string;
  /** One string per row: '#' = hole, any other char = playable cell. */
  readonly shape: readonly string[];
  /** Number of piece colors in play, 3..6. */
  readonly colors: number;
  readonly moves: number;
  readonly targetScore: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface TurnResult {
  /** False if the swap was illegal or made no match; no move is spent then. */
  readonly accepted: boolean;
  readonly events: readonly BoardEvent[];
  readonly points: number;
  /** Number of clear steps (1 = just the player's match). */
  readonly cascades: number;
  readonly shuffled: boolean;
}

/**
 * One play session of a level. Owns the board, RNG, score and move count. The only way to change
 * the board is trySwap(), which returns the full list of events for the renderer.
 */
export class Game {
  readonly level: LevelConfig;
  private readonly boardState: Board;
  private readonly rng: Rng;
  private readonly ids: IdSource;
  private readonly palette: readonly Color[];
  private scoreValue = 0;
  private movesLeftValue: number;
  private statusValue: GameStatus = 'playing';

  private constructor(level: LevelConfig, board: Board, rng: Rng, ids: IdSource) {
    if (level.colors < 3 || level.colors > MAX_COLORS) throw new RangeError(`colors must be 3..${MAX_COLORS}`);
    this.level = level;
    this.boardState = board;
    this.rng = rng;
    this.ids = ids;
    this.palette = Array.from({ length: level.colors }, (_, i) => i);
    this.movesLeftValue = level.moves;
  }

  /** Starts a level with a freshly generated board. Same seed → same game. */
  static start(level: LevelConfig, seed: number): Game {
    const rng = new Rng(seed);
    const ids = new IdSource();
    const palette = Array.from({ length: level.colors }, (_, i) => i);
    return new Game(level, generateBoard(level.shape, palette, rng, ids), rng, ids);
  }

  /** Starts from a prepared board (tests, replays). Refills use the seeded RNG. */
  static fromBoard(board: Board, level: Omit<LevelConfig, 'shape'>, seed: number): Game {
    const maxId = Math.max(0, ...board.pieces().map(({ piece }) => piece.id));
    return new Game({ ...level, shape: [] }, board.clone(), new Rng(seed), new IdSource(maxId + 1));
  }

  /** A copy of the current board; mutating it does not affect the game. */
  get board(): Board {
    return this.boardState.clone();
  }

  get score(): number {
    return this.scoreValue;
  }

  get movesLeft(): number {
    return this.movesLeftValue;
  }

  get status(): GameStatus {
    return this.statusValue;
  }

  hint(): Move | null {
    return bestMove(this.boardState);
  }

  trySwap(a: Pos, b: Pos): TurnResult {
    const board = this.boardState;
    const reject = (events: BoardEvent[]): TurnResult => ({ accepted: false, events, points: 0, cascades: 0, shuffled: false });
    if (this.statusValue !== 'playing') return reject([]);
    if (!isAdjacent(a, b) || !board.get(a) || !board.get(b)) return reject([]);

    const pa = board.get(a)!;
    const pb = board.get(b)!;
    board.swap(a, b);
    if (!isComboSwap(pa, pb) && !isInMatch(board, a) && !isInMatch(board, b)) {
      board.swap(a, b);
      return reject([{ type: 'swapRejected', a, b }]);
    }

    const resolver = new Resolver(board, this.palette, this.rng, this.ids, this.scoreValue);
    const cascade = resolver.resolveSwap(a, b);
    const events: BoardEvent[] = [{ type: 'swapped', a, b }, ...resolver.events];
    const points = resolver.points;

    let shuffled = false;
    if (!hasMove(board)) {
      events.push({ type: 'shuffled', moves: shuffleBoard(board, this.palette, this.rng) });
      shuffled = true;
    }

    this.scoreValue += points;
    this.movesLeftValue--;
    if (this.scoreValue >= this.level.targetScore) this.statusValue = 'won';
    else if (this.movesLeftValue <= 0) this.statusValue = 'lost';

    return { accepted: true, events, points, cascades: cascade, shuffled };
  }
}
