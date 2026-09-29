import type { Board } from './board';
import { type Color, type Pos, pos, posKey } from './types';

/** A straight line of 3+ same-colored pieces, cells ordered left→right or top→bottom. */
export interface Run {
  readonly color: Color;
  readonly horizontal: boolean;
  readonly cells: readonly Pos[];
}

/** 'line' = a single straight run; 'L' = runs meeting at their ends; 'T' = one run meets another's middle; 'cross' = middles cross. */
export type MatchShape = 'line' | 'L' | 'T' | 'cross';

/** The special a group would create (spawning specials arrives in a later phase). */
export type SpecialKind = 'none' | 'lineBlaster' | 'burstBomb' | 'prismOrb';

/** Connected runs of one color that share cells; one group is cleared together. */
export interface MatchGroup {
  readonly color: Color;
  readonly runs: readonly Run[];
  /** Unique cells of the group, row-major. */
  readonly cells: readonly Pos[];
  readonly shape: MatchShape;
  /** Length of the longest run in the group. */
  readonly longest: number;
  readonly special: SpecialKind;
}

export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < board.rows; r++) {
    scanLine(board, Array.from({ length: board.cols }, (_, c) => pos(r, c)), true, runs);
  }
  for (let c = 0; c < board.cols; c++) {
    scanLine(board, Array.from({ length: board.rows }, (_, r) => pos(r, c)), false, runs);
  }
  return runs;
}

function scanLine(board: Board, line: Pos[], horizontal: boolean, out: Run[]): void {
  let start = 0;
  while (start < line.length) {
    const color = board.get(line[start]!)?.color;
    let end = start + 1;
    if (color !== undefined) {
      while (end < line.length && board.get(line[end]!)?.color === color) end++;
      if (end - start >= 3) out.push({ color, horizontal, cells: line.slice(start, end) });
    }
    start = end;
  }
}

/** Groups runs that share a cell (L, T and cross shapes) into match groups. */
export function findGroups(board: Board): MatchGroup[] {
  const runs = findRuns(board);
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const owner = new Map<string, number>();
  runs.forEach((run, i) => {
    for (const p of run.cells) {
      const key = posKey(p);
      const other = owner.get(key);
      if (other === undefined) owner.set(key, i);
      else parent[find(i)] = find(other);
    }
  });
  const byRoot = new Map<number, Run[]>();
  runs.forEach((run, i) => {
    const root = find(i);
    const list = byRoot.get(root);
    if (list) list.push(run);
    else byRoot.set(root, [run]);
  });
  return [...byRoot.values()].map(makeGroup);
}

function makeGroup(runs: Run[]): MatchGroup {
  const unique = new Map<string, Pos>();
  for (const run of runs) for (const p of run.cells) unique.set(posKey(p), p);
  const cells = [...unique.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const shape = classifyShape(runs);
  const longest = Math.max(...runs.map((r) => r.cells.length));
  return { color: runs[0]!.color, runs, cells, shape, longest, special: specialFor(shape, longest) };
}

const SHAPE_RANK: Record<MatchShape, number> = { line: 0, L: 1, T: 2, cross: 3 };

function classifyShape(runs: readonly Run[]): MatchShape {
  let best: MatchShape = 'line';
  for (const h of runs) {
    if (!h.horizontal) continue;
    for (const v of runs) {
      if (v.horizontal) continue;
      const hi = h.cells.findIndex((p) => v.cells.some((q) => q.row === p.row && q.col === p.col));
      if (hi < 0) continue;
      const vi = v.cells.findIndex((q) => q.row === h.cells[hi]!.row && q.col === h.cells[hi]!.col);
      const hEnd = hi === 0 || hi === h.cells.length - 1;
      const vEnd = vi === 0 || vi === v.cells.length - 1;
      const shape: MatchShape = hEnd && vEnd ? 'L' : hEnd || vEnd ? 'T' : 'cross';
      if (SHAPE_RANK[shape] > SHAPE_RANK[best]) best = shape;
    }
  }
  return best;
}

/** 5+ in a line → Prism Orb, L/T/cross → Burst Bomb, 4 in a line → Line Blaster. */
export function specialFor(shape: MatchShape, longest: number): SpecialKind {
  if (longest >= 5) return 'prismOrb';
  if (shape !== 'line') return 'burstBomb';
  if (longest === 4) return 'lineBlaster';
  return 'none';
}

export function hasMatch(board: Board): boolean {
  return findRuns(board).length > 0;
}

/** Cheap local check: is the piece at p part of a horizontal or vertical run of 3+? */
export function isInMatch(board: Board, p: Pos): boolean {
  const color = board.get(p)?.color;
  if (color === undefined) return false;
  const count = (dr: number, dc: number): number => {
    let n = 0;
    let q = pos(p.row + dr, p.col + dc);
    while (board.get(q)?.color === color) {
      n++;
      q = pos(q.row + dr, q.col + dc);
    }
    return n;
  };
  return count(0, -1) + count(0, 1) >= 2 || count(-1, 0) + count(1, 0) >= 2;
}
