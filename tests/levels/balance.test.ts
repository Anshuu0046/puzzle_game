import { describe, it } from 'vitest';
import { LEVELS } from '../../src/data/levels';
import { botPlay } from './bot';

// Difficulty report for tuning (BALANCE=1 npm test -- tests/levels/balance.test.ts).
describe.runIf(process.env.BALANCE)('balance report', () => {
  it('prints bot win rate and scores per level', () => {
    const seeds = Array.from({ length: Number(process.env.SEEDS ?? 12) }, (_, i) => i + 1);
    const rows = LEVELS.map((level) => {
      const runs = seeds.map((s) => botPlay(level, s));
      const wins = runs.filter((r) => r.won);
      const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
      return {
        id: level.id,
        winRate: `${Math.round((wins.length / runs.length) * 100)}%`,
        avgScoreWin: avg(wins.map((r) => r.score)),
        avgMovesLeft: avg(wins.map((r) => r.movesLeft)),
        stars: level.stars.join('/'),
        avgStars: (wins.reduce((a, r) => a + r.stars, 0) / Math.max(1, wins.length)).toFixed(1),
      };
    });
    console.table(rows);
    // Machine-readable averages for the level generator's star thresholds.
    console.log(`BOT_JSON ${JSON.stringify(Object.fromEntries(LEVELS.map((l, i) => [l.id, rows[i]!.avgScoreWin])))}`);
  });
});
