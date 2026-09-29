import type { Effect } from './events';
import type { MatchGroup } from './match';

export const POINTS_PER_PIECE = 20;
/** Pieces caught in a special's blast rather than a match. */
export const POINTS_PER_BLASTED = 30;

const EFFECT_BONUS: Record<Effect, number> = {
  row: 60,
  column: 60,
  burst: 90,
  colorClear: 150,
  cross: 200,
  tripleCross: 300,
  megaBurst: 300,
  prismLines: 500,
  prismBursts: 500,
  boardWipe: 1000,
};

/** Flat bonus each time a special goes off (before the cascade multiplier). */
export function effectBonus(effect: Effect): number {
  return EFFECT_BONUS[effect];
}

/** Extra points for bigger shapes, on top of POINTS_PER_PIECE per cleared piece. */
export function shapeBonus(group: MatchGroup): number {
  if (group.longest >= 5) return 100;
  if (group.shape !== 'line') return 60;
  if (group.longest === 4) return 40;
  return 0;
}

/** Points for one group at the given cascade depth. Chains multiply: cascade 2 pays double, etc. */
export function groupPoints(group: MatchGroup, cascade: number): number {
  return (group.cells.length * POINTS_PER_PIECE + shapeBonus(group)) * cascade;
}
