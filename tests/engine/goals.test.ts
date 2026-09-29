import { describe, expect, it } from 'vitest';
import { Board, Game, hasMatch, starRating } from '../../src/engine';
import { EIGHT_BY_EIGHT, LEVEL, P, eventsOf, replay, signature } from './helpers';

// Swapping (2,2) with (3,2) clears row 3: (3,0) (3,1) (3,2).
const HOLE = `
  O G B
  # P Y
  G B R
  R R O`;

function withJelly(text: string, jelly: [number, number, number][]): Board {
  const b = Board.parse(text);
  for (const [r, c, n] of jelly) b.setJelly(P(r, c), n);
  return b;
}

describe('jelly', () => {
  it('a clear removes one jelly layer under each cleared piece', () => {
    const board = withJelly(HOLE, [
      [3, 0, 1],
      [3, 1, 1],
      [3, 2, 2],
      [0, 0, 1],
    ]);
    const game = Game.fromBoard(board, { ...LEVEL, goals: [{ kind: 'jelly' }] }, 1);
    const result = game.trySwap(P(2, 2), P(3, 2));
    const [jelly] = eventsOf(result.events, 'jellyCleared');
    expect(jelly!.cells).toEqual([
      { pos: P(3, 0), layers: 0 },
      { pos: P(3, 1), layers: 0 },
      { pos: P(3, 2), layers: 1 },
    ]);
    expect(game.board.jelly(P(0, 0))).toBe(1);
    const goal = game.goals[0]!;
    expect(goal.target).toBe(5);
    expect(goal.done).toBeGreaterThanOrEqual(3);
  });

  it('events replay jelly exactly', () => {
    const board = withJelly(HOLE, [
      [3, 0, 2],
      [2, 0, 1],
    ]);
    const game = Game.fromBoard(board, { ...LEVEL, goals: [{ kind: 'jelly' }] }, 1);
    const before = game.board;
    const result = game.trySwap(P(2, 2), P(3, 2));
    expect(signature(replay(before, result.events))).toBe(signature(game.board));
  });

  it('clearing all jelly wins a jelly level', () => {
    const board = withJelly(HOLE, [
      [3, 0, 1],
      [3, 1, 1],
    ]);
    const game = Game.fromBoard(board, { ...LEVEL, goals: [{ kind: 'jelly' }] }, 1);
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.status).toBe('won');
  });

  it('level jelly maps are applied at start', () => {
    const jelly = EIGHT_BY_EIGHT.map((_, r) => (r === 7 ? '22222222' : '........'));
    const game = Game.start({ ...LEVEL, shape: EIGHT_BY_EIGHT, jelly, goals: [{ kind: 'jelly' }] }, 3);
    expect(game.board.jellyTotal()).toBe(16);
    expect(game.goals[0]).toEqual({ kind: 'jelly', target: 16, done: 0 });
  });

  it('rejects jelly maps of the wrong size or on holes', () => {
    expect(() => Board.fromShape(['...']).applyJelly(['11'])).toThrow();
    expect(() => Board.fromShape(['.#.']).applyJelly(['.1.'])).toThrow();
  });
});

describe('goals', () => {
  it('collect goals count cleared pieces of that color', () => {
    const game = Game.fromBoard(Board.parse(HOLE), { ...LEVEL, goals: [{ kind: 'collect', color: 0, count: 3 }] }, 1);
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.goals[0]).toMatchObject({ kind: 'collect', color: 0, target: 3, done: 3 });
    expect(game.status).toBe('won');
  });

  it('progress is capped at the target', () => {
    const game = Game.fromBoard(Board.parse(HOLE), { ...LEVEL, goals: [{ kind: 'collect', color: 0, count: 2 }] }, 1);
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.goals[0]!.done).toBe(2);
  });

  it('emits goal progress after each scoring step', () => {
    const game = Game.fromBoard(Board.parse(HOLE), { ...LEVEL, goals: [{ kind: 'score', target: 1000 }] }, 1);
    const result = game.trySwap(P(2, 2), P(3, 2));
    const goals = eventsOf(result.events, 'goals');
    expect(goals.length).toBe(eventsOf(result.events, 'scored').length);
    expect(goals[0]!.goals[0]).toEqual({ kind: 'score', target: 1000, done: 60 });
  });

  it('needs every goal to win', () => {
    const game = Game.fromBoard(
      Board.parse(HOLE),
      { ...LEVEL, goals: [{ kind: 'collect', color: 0, count: 3 }, { kind: 'score', target: 100_000 }] },
      1,
    );
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.status).toBe('playing');
  });

  it('is lost when moves run out with goals unmet', () => {
    const game = Game.fromBoard(Board.parse(HOLE), { ...LEVEL, moves: 1, goals: [{ kind: 'collect', color: 0, count: 50 }] }, 1);
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.status).toBe('lost');
  });

  it('requires at least one goal', () => {
    expect(() => Game.start({ ...LEVEL, shape: EIGHT_BY_EIGHT, goals: [] }, 1)).toThrow();
  });
});

describe('stars', () => {
  it('counts thresholds reached, with at least one star for a win', () => {
    expect(starRating(0, [100, 200, 300], false)).toBe(0);
    expect(starRating(0, [100, 200, 300], true)).toBe(1);
    expect(starRating(250, [100, 200, 300], true)).toBe(2);
    expect(starRating(300, [100, 200, 300], true)).toBe(3);
  });

  it('the game reports its stars', () => {
    const game = Game.fromBoard(Board.parse(HOLE), { ...LEVEL, stars: [50, 100, 1000], goals: [{ kind: 'score', target: 50 }] }, 1);
    expect(game.stars).toBe(0);
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.stars).toBeGreaterThanOrEqual(1);
  });
});

describe('finale', () => {
  const won = (moves: number) => {
    const game = Game.fromBoard(Board.parse(HOLE), { ...LEVEL, moves, goals: [{ kind: 'score', target: 50 }] }, 1);
    game.trySwap(P(2, 2), P(3, 2));
    expect(game.status).toBe('won');
    return game;
  };

  it('turns every leftover move into a Line Blaster and fires them all', () => {
    const game = won(6);
    const before = game.board;
    const scoreBefore = game.score;
    expect(game.canFinale).toBe(true);
    const result = game.finale();
    expect(result.events[0]).toEqual({ type: 'finale', moves: 5 });
    const bonus = eventsOf(result.events, 'bonusMove');
    expect(bonus.map((b) => b.movesLeft)).toEqual([4, 3, 2, 1, 0]);
    expect(bonus.every((b) => b.piece.special === 'lineH' || b.piece.special === 'lineV')).toBe(true);
    expect(game.movesLeft).toBe(0);
    expect(game.score).toBeGreaterThan(scoreBefore);
    const after = game.board;
    expect(after.isFull()).toBe(true);
    expect(hasMatch(after)).toBe(false);
    expect(after.pieces().some(({ piece }) => piece.special !== 'none')).toBe(false);
    expect(signature(replay(before, result.events))).toBe(signature(after));
  });

  it('runs only once, and only after a win', () => {
    const game = won(4);
    game.finale();
    expect(game.canFinale).toBe(false);
    expect(game.finale().events).toEqual([]);
    const playing = Game.fromBoard(Board.parse(HOLE), LEVEL, 1);
    expect(playing.canFinale).toBe(false);
    expect(playing.finale().accepted).toBe(false);
  });

  it('has nothing to do without leftover moves', () => {
    const game = won(1);
    expect(game.canFinale).toBe(false);
  });

  it('finale on a full 8x8 level stays consistent', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = Game.start({ ...LEVEL, shape: EIGHT_BY_EIGHT, moves: 30, goals: [{ kind: 'score', target: 1 }] }, seed);
      const move = game.hint()!;
      game.trySwap(move.a, move.b);
      const before = game.board;
      const result = game.finale();
      expect(signature(replay(before, result.events)), `seed ${seed}`).toBe(signature(game.board));
      expect(eventsOf(result.events, 'scored').at(-1)!.total).toBe(game.score);
    }
  });
});
