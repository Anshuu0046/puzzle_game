import type { LevelConfig } from '../../src/engine';
import { Game } from '../../src/engine';

/** Greedy bot: always plays the engine's hint (biggest immediate clear). */
export function botPlay(level: LevelConfig, seed: number): { won: boolean; score: number; stars: number; movesLeft: number } {
  const game = Game.start(level, seed);
  while (game.status === 'playing') {
    const move = game.hint();
    if (!move) throw new Error(`level ${level.id}: no move available`);
    game.trySwap(move.a, move.b);
  }
  const movesLeft = game.movesLeft;
  if (game.canFinale) game.finale();
  return { won: game.status === 'won', score: game.score, stars: game.stars, movesLeft };
}
