import { describe, expect, it } from 'vitest';
import { LEVELS, WORLDS, validateLevel, worldOf } from '../../src/data/levels';
import { Game, hasMatch, hasMove } from '../../src/engine';
import { botPlay } from './bot';

describe('levels', () => {
  it('ships 30 levels with consecutive ids', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('every level belongs to a world', () => {
    for (const l of LEVELS) expect(worldOf(l.id).name).toBe(l.name);
    expect(WORLDS.at(-1)!.lastLevel).toBe(LEVELS.length);
  });

  it('every level starts playable', () => {
    for (const level of LEVELS) {
      for (const seed of [1, 2, 3]) {
        const game = Game.start(level, seed);
        expect(hasMatch(game.board), `level ${level.id}`).toBe(false);
        expect(hasMove(game.board), `level ${level.id}`).toBe(true);
      }
    }
  });

  it('every level can be won by a simple greedy bot', () => {
    for (const level of LEVELS) {
      const wins = [1, 2, 3, 4, 5, 6].map((seed) => botPlay(level, seed).won).filter(Boolean).length;
      expect(wins, `level ${level.id} bot wins`).toBeGreaterThan(0);
    }
  });

  it('validation rejects broken level data', () => {
    const good = LEVELS[3]!;
    expect(() => validateLevel({ ...good, stars: [300, 200, 100] })).toThrow(/stars/);
    expect(() => validateLevel({ ...good, goals: [] })).toThrow(/goal/);
    expect(() => validateLevel({ ...good, goals: [{ kind: 'collect', color: 9, count: 5 }] })).toThrow(/palette/);
    expect(() => validateLevel({ ...good, jelly: undefined })).toThrow(/jelly/);
    expect(() => validateLevel({ ...good, shape: ['...', '..'] })).toThrow(/shape/);
    expect(() => validateLevel({ ...good, colors: 9 })).toThrow(/colors/);
  });
});
