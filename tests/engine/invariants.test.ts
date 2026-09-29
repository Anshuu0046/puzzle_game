import { describe, expect, it } from 'vitest';
import { Game, Rng, findMoves, hasMatch, hasMove } from '../../src/engine';
import { EIGHT_BY_EIGHT, LEVEL, eventsOf, replay, signature } from './helpers';

/** Plays many random games and checks the rules hold after every single turn. */
function fuzz(shape: readonly string[], colors: number, seeds: number, turns: number) {
  let shuffles = 0;
  let maxCascade = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const game = Game.start({ ...LEVEL, shape, colors, moves: 10_000 }, seed);
    const chooser = new Rng(seed * 7919);
    for (let t = 0; t < turns; t++) {
      const before = game.board;
      const moves = findMoves(before);
      expect(moves.length, `seed ${seed} turn ${t}: board has no move`).toBeGreaterThan(0);
      const move = chooser.pick(moves);
      const scoreBefore = game.score;
      const result = game.trySwap(move.a, move.b);
      const ctx = `seed ${seed} turn ${t}`;

      expect(result.accepted, ctx).toBe(true);
      const after = game.board;
      expect(after.isFull(), ctx).toBe(true);
      expect(hasMatch(after), ctx).toBe(false);
      expect(hasMove(after), ctx).toBe(true);
      expect(signature(replay(before, result.events)), ctx).toBe(signature(after));

      const ids = after.pieces().map(({ piece }) => piece.id);
      expect(new Set(ids).size, ctx).toBe(ids.length);
      expect(after.pieces().every(({ piece }) => piece.color < colors), ctx).toBe(true);

      const scored = eventsOf(result.events, 'scored');
      expect(scored.reduce((s, e) => s + e.points, 0), ctx).toBe(game.score - scoreBefore);
      expect(scored.map((e) => e.cascade), ctx).toEqual(scored.map((_, i) => i + 1));

      if (result.shuffled) shuffles++;
      maxCascade = Math.max(maxCascade, result.cascades);
    }
  }
  return { shuffles, maxCascade };
}

describe('engine invariants under random play', () => {
  it('8x8 with 6 colors', () => {
    const { maxCascade } = fuzz(EIGHT_BY_EIGHT, 6, 40, 40);
    expect(maxCascade).toBeGreaterThan(1);
  });

  it('shaped board with holes', () => {
    fuzz(['##....##', '#......#', '........', '...##...', '...##...', '........', '#......#', '##....##'], 5, 20, 40);
  });

  it('small crowded board exercises auto-shuffle', () => {
    const { shuffles } = fuzz(['.....', '.....', '.....', '.....'], 6, 30, 30);
    expect(shuffles).toBeGreaterThan(0);
  });
});
