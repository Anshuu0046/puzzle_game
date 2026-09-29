import type { Board } from './board';
import type { BoardEvent, Fall, PlacedPiece, Spawn } from './events';
import { IdSource, generateBoard } from './generate';
import { findGroups, isInMatch } from './match';
import { bestMove, hasMove } from './moves';
import { Rng } from './rng';
import { groupPoints } from './scoring';
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

/** Safety net: real cascades stop long before this. */
const MAX_CASCADES = 100;

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

    board.swap(a, b);
    if (!isInMatch(board, a) && !isInMatch(board, b)) {
      board.swap(a, b);
      return reject([{ type: 'swapRejected', a, b }]);
    }

    const events: BoardEvent[] = [{ type: 'swapped', a, b }];
    let points = 0;
    let cascade = 0;
    for (;;) {
      const groups = findGroups(board);
      if (groups.length === 0) break;
      if (++cascade > MAX_CASCADES) throw new Error('cascade limit exceeded');

      events.push({ type: 'matched', cascade, groups });
      const cleared: PlacedPiece[] = [];
      for (const group of groups) {
        for (const p of group.cells) {
          cleared.push({ pos: p, piece: board.get(p)! });
          board.set(p, null);
        }
      }
      events.push({ type: 'cleared', cascade, pieces: cleared });

      const stepPoints = groups.reduce((sum, g) => sum + groupPoints(g, cascade), 0);
      points += stepPoints;
      events.push({ type: 'scored', cascade, points: stepPoints, total: this.scoreValue + points });

      this.settle(events);
    }

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

  /** Gravity then refill: pieces drop past holes to the lowest free cells; new ones enter from the top. */
  private settle(events: BoardEvent[]): void {
    const board = this.boardState;
    const falls: Fall[] = [];
    const spawns: Spawn[] = [];
    for (let c = 0; c < board.cols; c++) {
      const cells = board.column(c);
      if (cells.length === 0) continue;
      let write = cells.length - 1;
      for (let read = cells.length - 1; read >= 0; read--) {
        const piece = board.get(cells[read]!);
        if (!piece) continue;
        if (read !== write) {
          board.set(cells[write]!, piece);
          board.set(cells[read]!, null);
          falls.push({ piece, from: cells[read]!, to: cells[write]! });
        }
        write--;
      }
      const empty = write + 1;
      const topRow = cells[0]!.row;
      for (let i = 0; i < empty; i++) {
        const piece = { id: this.ids.next(), color: this.rng.pick(this.palette) };
        board.set(cells[i]!, piece);
        spawns.push({ piece, to: cells[i]!, startRow: topRow - (empty - i) });
      }
    }
    if (falls.length > 0) events.push({ type: 'fell', falls });
    if (spawns.length > 0) events.push({ type: 'spawned', spawns });
  }
}
