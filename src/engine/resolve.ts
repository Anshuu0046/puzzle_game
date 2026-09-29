import type { Board } from './board';
import type { BoardEvent, Effect, Fall, PlacedPiece, Spawn } from './events';
import type { IdSource } from './generate';
import type { GoalTracker } from './goals';
import { type MatchGroup, findGroups } from './match';
import type { Rng } from './rng';
import { POINTS_PER_BLASTED, effectBonus, groupPoints } from './scoring';
import { type Color, type Piece, type Pos, type Special, isLine, plain, pos, posKey, samePos } from './types';

/** Safety net: real cascades stop long before this. */
const MAX_CASCADES = 100;
/** Finale rounds stop here even if specials keep appearing. */
const MAX_FINALE_ROUNDS = 20;
/** The finale's own blasts don't multiply past this (its cascades still do). */
const FINALE_MAX_MULTIPLIER = 3;

/** A swap that goes off without needing a match: any Prism Orb swap, or two specials together. */
export function isComboSwap(a: Piece, b: Piece): boolean {
  return a.special === 'prism' || b.special === 'prism' || (a.special !== 'none' && b.special !== 'none');
}

/** The special a match group turns into, or 'none'. A 4-run's blaster sweeps across the run. */
export function specialForGroup(group: MatchGroup): Special {
  switch (group.special) {
    case 'prismOrb':
      return 'prism';
    case 'burstBomb':
      return 'burst';
    case 'lineBlaster':
      return group.runs.find((r) => r.cells.length === group.longest)!.horizontal ? 'lineV' : 'lineH';
    default:
      return 'none';
  }
}

/**
 * Where a group's special appears: a swapped cell inside the group (the player's move), else the
 * crossing cell of an L/T/+, else the middle of the longest run.
 */
export function specialPosition(group: MatchGroup, preferred: readonly Pos[]): Pos {
  for (const p of preferred) if (group.cells.some((c) => samePos(c, p))) return p;
  const horizontal = group.runs.filter((r) => r.horizontal).flatMap((r) => r.cells);
  const vertical = group.runs.filter((r) => !r.horizontal).flatMap((r) => r.cells);
  const crossing = group.cells.find((c) => horizontal.some((h) => samePos(h, c)) && vertical.some((v) => samePos(v, c)));
  if (crossing) return crossing;
  const longest = group.runs.find((r) => r.cells.length === group.longest)!;
  return longest.cells[Math.floor((longest.cells.length - 1) / 2)]!;
}

/**
 * Resolves one accepted swap: combos, match steps with chain reactions, gravity and refill, until
 * the board is stable. Mutates the board and collects events.
 */
export class Resolver {
  readonly events: BoardEvent[] = [];
  points = 0;

  constructor(
    private readonly board: Board,
    private readonly palette: readonly Color[],
    private readonly rng: Rng,
    private readonly ids: IdSource,
    private readonly scoreBefore: number,
    private readonly tracker: GoalTracker | null = null,
  ) {}

  /** `a` → `b` is the player's drag; the swap is already applied to the board. Returns the cascade count. */
  resolveSwap(a: Pos, b: Pos): number {
    let cascade = 0;
    const moved = this.board.get(b)!;
    const other = this.board.get(a)!;
    if (isComboSwap(moved, other)) {
      cascade = 1;
      this.comboStep(a, b, cascade);
      this.settle();
    }
    return this.cascadeFrom(cascade, cascade === 0 ? [b, a] : []);
  }

  /** Clears matches until none are left, starting after `cascade` steps. Returns the final count. */
  cascadeFrom(cascade: number, preferred: readonly Pos[] = []): number {
    let prefer = preferred;
    for (;;) {
      const groups = findGroups(this.board);
      if (groups.length === 0) return cascade;
      if (++cascade > MAX_CASCADES) throw new Error('cascade limit exceeded');
      this.matchStep(groups, cascade, prefer);
      prefer = [];
      this.settle();
    }
  }

  private matchStep(groups: readonly MatchGroup[], cascade: number, preferred: readonly Pos[]): void {
    this.events.push({ type: 'matched', cascade, groups });
    const spawns = groups
      .map((group) => ({ group, special: specialForGroup(group), at: specialPosition(group, preferred) }))
      .filter((s) => s.special !== 'none');

    const blast = new Blast(this.board, this.events, cascade);
    for (const g of groups) for (const p of g.cells) blast.add(p);
    blast.run();
    const cleared = this.commit(blast);

    for (const { group, special, at } of spawns) {
      const piece: Piece = { id: this.ids.next(), color: special === 'prism' ? null : group.color, special };
      this.board.set(at, piece);
      this.events.push({ type: 'specialCreated', cascade, pos: at, piece, from: group.cells });
    }

    const matchedCells = groups.reduce((n, g) => n + g.cells.length, 0);
    const points =
      groups.reduce((sum, g) => sum + groupPoints(g, cascade), 0) +
      ((cleared.length - matchedCells) * POINTS_PER_BLASTED + blast.bonus) * cascade;
    this.addPoints(cascade, points);
  }

  private comboStep(a: Pos, b: Pos, cascade: number): void {
    const board = this.board;
    const moved = board.get(b)!;
    const other = board.get(a)!;
    const blast = new Blast(board, this.events, cascade);

    if (moved.special === 'prism' && other.special === 'prism') {
      blast.preActivate(a);
      blast.preActivate(b);
      blast.fire(b, moved, 'boardWipe', board.positions);
    } else if (moved.special === 'prism' || other.special === 'prism') {
      const [prismAt, prism, target] = moved.special === 'prism' ? [b, moved, other] : [a, other, moved];
      const color = target.color!;
      blast.preActivate(prismAt);
      const targets = board.positions.filter((p) => board.get(p)?.color === color);
      if (target.special === 'none') {
        blast.fire(prismAt, prism, 'colorClear', [prismAt, ...targets]);
      } else {
        // Every piece of that color becomes the swapped special, then they all go off.
        const effect: Effect = isLine(target.special) ? 'prismLines' : 'prismBursts';
        this.events.push({ type: 'specialActivated', cascade, pos: prismAt, piece: prism, effect, cells: [prismAt, ...targets] });
        blast.bonus += effectBonus(effect);
        for (const p of targets) {
          const piece = board.get(p)!;
          if (piece.special !== 'none') continue;
          const special: Special = effect === 'prismBursts' ? 'burst' : this.rng.int(2) === 0 ? 'lineH' : 'lineV';
          const next: Piece = { ...piece, special };
          board.set(p, next);
          this.events.push({ type: 'transformed', pos: p, piece: next });
        }
        blast.add(prismAt);
        for (const p of targets) blast.add(p);
      }
    } else {
      blast.preActivate(a);
      blast.preActivate(b);
      const lines = [moved, other].filter((p) => isLine(p.special)).length;
      if (lines === 2) {
        blast.fire(b, moved, 'cross', [...rowCells(board, b.row), ...colCells(board, b.col)]);
      } else if (lines === 1) {
        const cells: Pos[] = [];
        for (let d = -1; d <= 1; d++) cells.push(...rowCells(board, b.row + d), ...colCells(board, b.col + d));
        blast.fire(b, moved, 'tripleCross', cells);
      } else {
        blast.fire(b, moved, 'megaBurst', square(board, b, 2));
      }
    }
    blast.run();
    const cleared = this.commit(blast);
    this.addPoints(cascade, (cleared.length * POINTS_PER_BLASTED + blast.bonus) * cascade);
  }

  /**
   * End-of-level bonus: each leftover move turns a random plain piece into a Line Blaster, then every
   * special on the board fires, round after round, until none are left. Returns the cascade count.
   */
  finale(moves: number): number {
    const board = this.board;
    this.events.push({ type: 'finale', moves });
    let left = moves;
    for (let i = 0; i < moves; i++) {
      const plainCells = board.positions.filter((p) => board.get(p)?.special === 'none');
      if (plainCells.length === 0) break;
      const p = this.rng.pick(plainCells);
      const piece: Piece = { ...board.get(p)!, special: this.rng.int(2) === 0 ? 'lineH' : 'lineV' };
      board.set(p, piece);
      this.events.push({ type: 'bonusMove', pos: p, piece, movesLeft: --left });
    }
    let cascade = 0;
    for (let round = 0; round < MAX_FINALE_ROUNDS; round++) {
      const specials = board.positions.filter((p) => (board.get(p)?.special ?? 'none') !== 'none');
      if (specials.length === 0) break;
      cascade++;
      const blast = new Blast(board, this.events, cascade);
      for (const p of specials) blast.add(p);
      blast.run();
      const cleared = this.commit(blast);
      this.addPoints(cascade, (cleared.length * POINTS_PER_BLASTED + blast.bonus) * Math.min(cascade, FINALE_MAX_MULTIPLIER));
      this.settle();
      cascade = this.cascadeFrom(cascade);
    }
    return cascade;
  }

  /** Clears the blast's cells, peels jelly under them and records goal progress. */
  private commit(blast: Blast): PlacedPiece[] {
    const cleared = blast.commit();
    const jelly: { pos: Pos; layers: number }[] = [];
    for (const { pos: p } of cleared) {
      const layers = this.board.jelly(p);
      if (layers > 0) {
        this.board.setJelly(p, layers - 1);
        jelly.push({ pos: p, layers: layers - 1 });
      }
    }
    if (jelly.length > 0) this.events.push({ type: 'jellyCleared', cells: jelly });
    this.tracker?.recordCleared(cleared);
    this.tracker?.recordJelly(jelly.length);
    return cleared;
  }

  private addPoints(cascade: number, points: number): void {
    this.points += points;
    const total = this.scoreBefore + this.points;
    this.events.push({ type: 'scored', cascade, points, total });
    if (this.tracker) {
      this.tracker.setScore(total);
      this.events.push({ type: 'goals', goals: this.tracker.progress() });
    }
  }

  /** Gravity then refill: pieces drop past holes to the lowest free cells; new ones enter from the top. */
  settle(): void {
    const board = this.board;
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
        const piece = plain(this.ids.next(), this.rng.pick(this.palette));
        board.set(cells[i]!, piece);
        spawns.push({ piece, to: cells[i]!, startRow: topRow - (empty - i) });
      }
    }
    if (falls.length > 0) this.events.push({ type: 'fell', falls });
    if (spawns.length > 0) this.events.push({ type: 'spawned', spawns });
  }
}

/** One clear step: the cells to remove, and specials going off in a chain until nothing new is hit. */
class Blast {
  private readonly cells = new Map<string, Pos>();
  private readonly activated = new Set<string>();
  private readonly queue: Pos[] = [];
  bonus = 0;

  constructor(
    private readonly board: Board,
    private readonly events: BoardEvent[],
    private readonly cascade: number,
  ) {}

  add(p: Pos): void {
    const piece = this.board.get(p);
    const key = posKey(p);
    if (!piece || this.cells.has(key)) return;
    this.cells.set(key, p);
    if (piece.special !== 'none' && !this.activated.has(key)) this.queue.push(p);
  }

  /** Marks a swapped special as already spent: it is cleared but does not fire on its own. */
  preActivate(p: Pos): void {
    const key = posKey(p);
    this.activated.add(key);
    this.cells.set(key, p);
  }

  fire(origin: Pos, piece: Piece, effect: Effect, cells: readonly Pos[]): void {
    const unique = dedupe(cells.filter((p) => this.board.isPlayable(p)));
    this.events.push({ type: 'specialActivated', cascade: this.cascade, pos: origin, piece, effect, cells: unique });
    this.bonus += effectBonus(effect);
    for (const p of unique) this.add(p);
  }

  run(): void {
    const board = this.board;
    while (this.queue.length > 0) {
      const p = this.queue.shift()!;
      const key = posKey(p);
      if (this.activated.has(key)) continue;
      this.activated.add(key);
      const piece = board.get(p)!;
      switch (piece.special) {
        case 'lineH':
          this.fire(p, piece, 'row', rowCells(board, p.row));
          break;
        case 'lineV':
          this.fire(p, piece, 'column', colCells(board, p.col));
          break;
        case 'burst':
          this.fire(p, piece, 'burst', square(board, p, 1));
          break;
        case 'prism': {
          const color = this.mostCommonColor();
          const targets = color === null ? [] : board.positions.filter((q) => board.get(q)?.color === color);
          this.fire(p, piece, 'colorClear', [p, ...targets]);
          break;
        }
        case 'none':
          break;
      }
    }
  }

  /** Removes every marked piece from the board and reports them. */
  commit(): PlacedPiece[] {
    const cleared = [...this.cells.values()].map((p) => ({ pos: p, piece: this.board.get(p)! }));
    for (const { pos: p } of cleared) this.board.set(p, null);
    this.events.push({ type: 'cleared', cascade: this.cascade, pieces: cleared });
    return cleared;
  }

  /** The color with the most pieces not already being cleared (lowest index wins ties). */
  private mostCommonColor(): Color | null {
    const counts = new Map<Color, number>();
    for (const { pos: p, piece } of this.board.pieces()) {
      if (piece.color === null || this.cells.has(posKey(p))) continue;
      counts.set(piece.color, (counts.get(piece.color) ?? 0) + 1);
    }
    let best: Color | null = null;
    let bestCount = 0;
    for (const [color, n] of [...counts.entries()].sort((x, y) => x[0] - y[0])) {
      if (n > bestCount) {
        best = color;
        bestCount = n;
      }
    }
    return best;
  }
}

function rowCells(board: Board, row: number): Pos[] {
  if (row < 0 || row >= board.rows) return [];
  return Array.from({ length: board.cols }, (_, c) => pos(row, c)).filter((p) => board.isPlayable(p));
}

function colCells(board: Board, col: number): Pos[] {
  if (col < 0 || col >= board.cols) return [];
  return Array.from({ length: board.rows }, (_, r) => pos(r, col)).filter((p) => board.isPlayable(p));
}

function square(board: Board, center: Pos, radius: number): Pos[] {
  const out: Pos[] = [];
  for (let r = center.row - radius; r <= center.row + radius; r++) {
    for (let c = center.col - radius; c <= center.col + radius; c++) {
      if (board.isPlayable(pos(r, c))) out.push(pos(r, c));
    }
  }
  return out;
}

function dedupe(cells: readonly Pos[]): Pos[] {
  const seen = new Map<string, Pos>();
  for (const p of cells) seen.set(posKey(p), p);
  return [...seen.values()];
}
