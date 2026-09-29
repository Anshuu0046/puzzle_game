import type { MatchGroup } from './match';

export const POINTS_PER_PIECE = 20;

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
