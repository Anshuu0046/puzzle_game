import { describe, expect, it } from 'vitest';
import { Board, Game, findGroups, groupPoints, hasMatch, hasMove } from '../../src/engine';
import { EIGHT_BY_EIGHT, LEVEL, P, eventsOf, gameFrom, replay, signature } from './helpers';

// Swapping (3,2)P with (3,3)R clears R R R on row 3. Everything above drops one row, which lines up
// P P P on row 3 as a second cascade.
const CASCADE = `
  Y B O G
  O Y B O
  G P P Y
  R R P R`;

// Column 0 has a hole at row 1; pieces must fall past it.
const HOLE = `
  O G B
  # P Y
  G B R
  R R O`;

describe('Game.trySwap', () => {
  it('rejects a swap that makes no match and leaves everything unchanged', () => {
    const game = gameFrom(CASCADE);
    const before = signature(game.board);
    const result = game.trySwap(P(0, 0), P(0, 1));
    expect(result.accepted).toBe(false);
    expect(result.events).toEqual([{ type: 'swapRejected', a: P(0, 0), b: P(0, 1) }]);
    expect(signature(game.board)).toBe(before);
    expect(game.movesLeft).toBe(LEVEL.moves);
    expect(game.score).toBe(0);
  });

  it('ignores illegal swaps without any event', () => {
    const game = gameFrom(HOLE);
    for (const [a, b] of [
      [P(0, 0), P(0, 2)], // not adjacent
      [P(0, 0), P(1, 1)], // diagonal
      [P(0, 0), P(1, 0)], // into a hole
      [P(3, 2), P(3, 3)], // off the board
    ] as const) {
      const result = game.trySwap(a, b);
      expect(result.accepted).toBe(false);
      expect(result.events).toEqual([]);
    }
    expect(game.movesLeft).toBe(LEVEL.moves);
  });

  it('emits swapped → matched → cleared → scored → fell → spawned for a simple match', () => {
    const game = gameFrom(HOLE);
    const result = game.trySwap(P(2, 2), P(3, 2));
    expect(result.accepted).toBe(true);
    expect(result.events.slice(0, 6).map((e) => e.type)).toEqual(['swapped', 'matched', 'cleared', 'scored', 'fell', 'spawned']);
    const [cleared] = eventsOf(result.events, 'cleared');
    expect(cleared!.pieces.map((c) => c.pos)).toEqual([P(3, 0), P(3, 1), P(3, 2)]);
    expect(cleared!.pieces.every((c) => c.piece.color === 0)).toBe(true);
    expect(game.movesLeft).toBe(LEVEL.moves - 1);
  });

  it('works when the player drags either piece', () => {
    const a = gameFrom(HOLE).trySwap(P(2, 2), P(3, 2));
    const b = gameFrom(HOLE).trySwap(P(3, 2), P(2, 2));
    expect(a.accepted && b.accepted).toBe(true);
    expect(eventsOf(b.events, 'cleared')[0]!.pieces.map((c) => c.pos)).toEqual([P(3, 0), P(3, 1), P(3, 2)]);
  });

  it('drops pieces past holes and spawns new ones above the column', () => {
    const game = gameFrom(HOLE);
    const before = game.board;
    const result = game.trySwap(P(2, 2), P(3, 2));
    const [fell] = eventsOf(result.events, 'fell');
    const col0 = fell!.falls.filter((f) => f.from.col === 0);
    expect(col0).toEqual([
      { piece: before.get(P(2, 0)), from: P(2, 0), to: P(3, 0) },
      { piece: before.get(P(0, 0)), from: P(0, 0), to: P(2, 0) },
    ]);
    const [spawned] = eventsOf(result.events, 'spawned');
    expect(spawned!.spawns.map((s) => [s.to, s.startRow])).toEqual([
      [P(0, 0), -1],
      [P(0, 1), -1],
      [P(0, 2), -1],
    ]);
    expect(game.board.get(P(1, 0))).toBeNull();
    expect(game.board.isFull()).toBe(true);
  });

  it('stacks multiple spawns in one column above the top cell', () => {
    // Swapping (2,0)G with (2,1)R completes R R R in column 0, rows 2-4.
    const game = gameFrom(`
      O G B
      P B Y
      G R O
      R O B
      R Y O`);
    const result = game.trySwap(P(2, 0), P(2, 1));
    const [cleared] = eventsOf(result.events, 'cleared');
    expect(cleared!.pieces.map((c) => c.pos)).toEqual([P(2, 0), P(3, 0), P(4, 0)]);
    const [spawned] = eventsOf(result.events, 'spawned');
    expect(spawned!.spawns.filter((s) => s.to.col === 0).map((s) => [s.to.row, s.startRow])).toEqual([
      [0, -3],
      [1, -2],
      [2, -1],
    ]);
  });

  it('runs cascades with increasing multipliers', () => {
    const game = gameFrom(CASCADE);
    const result = game.trySwap(P(3, 2), P(3, 3));
    expect(result.cascades).toBeGreaterThanOrEqual(2);
    const matched = eventsOf(result.events, 'matched');
    expect(matched[0]!.cascade).toBe(1);
    expect(matched[1]!.cascade).toBe(2);
    const second = matched[1]!.groups.find((g) => g.color === 5);
    expect(second?.cells).toEqual([P(3, 1), P(3, 2), P(3, 3)]);

    const scored = eventsOf(result.events, 'scored');
    expect(scored[0]).toMatchObject({ cascade: 1, points: 60, total: 60 });
    expect(groupPoints(second!, 2)).toBe(120);
    expect(scored[1]!.points).toBeGreaterThanOrEqual(120);
    expect(scored.at(-1)!.total).toBe(game.score);
    expect(result.points).toBe(game.score);
  });

  it('leaves no matches on the board after a turn', () => {
    const game = gameFrom(CASCADE);
    game.trySwap(P(3, 2), P(3, 3));
    expect(hasMatch(game.board)).toBe(false);
    expect(game.board.isFull()).toBe(true);
  });

  it('scores bigger shapes higher', () => {
    const line3 = findGroups(Board.parse('R R R'))[0]!;
    const line4 = findGroups(Board.parse('R R R R'))[0]!;
    const line5 = findGroups(Board.parse('R R R R R'))[0]!;
    const ell = findGroups(Board.parse('R . .\nR . .\nR R R'))[0]!;
    expect(groupPoints(line3, 1)).toBe(60);
    expect(groupPoints(line4, 1)).toBe(120);
    expect(groupPoints(ell, 1)).toBe(160);
    expect(groupPoints(line5, 1)).toBe(200);
    expect(groupPoints(line3, 3)).toBe(180);
  });

  it('the board getter is a copy', () => {
    const game = gameFrom(HOLE);
    game.board.set(P(0, 0), null);
    expect(game.board.get(P(0, 0))).not.toBeNull();
  });
});

describe('Game lifecycle', () => {
  it('is won once the target score is reached', () => {
    const game = gameFrom(HOLE, 1, { targetScore: 50 });
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.status).toBe('won');
    expect(game.trySwap(P(0, 0), P(0, 1)).events).toEqual([]);
  });

  it('is lost when moves run out below target', () => {
    const game = gameFrom(HOLE, 1, { moves: 1 });
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.movesLeft).toBe(0);
    expect(game.status).toBe('lost');
  });

  it('rejected swaps do not spend moves', () => {
    const game = gameFrom(HOLE, 1, { moves: 1 });
    game.trySwap(P(0, 0), P(0, 1));
    expect(game.status).toBe('playing');
    expect(game.movesLeft).toBe(1);
  });

  it('starts a level from config with a playable board', () => {
    const game = Game.start({ ...LEVEL, shape: EIGHT_BY_EIGHT }, 1234);
    expect(game.board.isFull()).toBe(true);
    expect(hasMatch(game.board)).toBe(false);
    expect(hasMove(game.board)).toBe(true);
    expect(game.hint()).not.toBeNull();
  });

  it('rejects invalid color counts', () => {
    expect(() => Game.start({ ...LEVEL, colors: 2, shape: EIGHT_BY_EIGHT }, 1)).toThrow();
    expect(() => Game.start({ ...LEVEL, colors: 7, shape: EIGHT_BY_EIGHT }, 1)).toThrow();
  });

  it('is fully deterministic for a seed and move list', () => {
    const play = () => {
      const game = Game.start({ ...LEVEL, shape: EIGHT_BY_EIGHT }, 77);
      const log: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        const hint = game.hint()!;
        log.push(game.trySwap(hint.a, hint.b).events);
      }
      return JSON.stringify(log);
    };
    expect(play()).toBe(play());
  });

  it('events replay exactly onto the previous board', () => {
    const game = gameFrom(CASCADE);
    const before = game.board;
    const result = game.trySwap(P(3, 2), P(3, 3));
    expect(signature(replay(before, result.events))).toBe(signature(game.board));
  });
});
