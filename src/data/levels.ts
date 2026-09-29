import { type GoalConfig, type LevelConfig, MAX_COLORS } from '../engine';

/** A themed garden grouping ten levels on the world map. */
export interface World {
  readonly id: number;
  readonly name: string;
  readonly firstLevel: number;
  readonly lastLevel: number;
  /** Map background gradient, top to bottom. */
  readonly sky: readonly [string, string];
}

export const WORLDS: readonly World[] = [
  { id: 1, name: 'Blossom Lane', firstLevel: 1, lastLevel: 10, sky: ['#ffe1ee', '#fff4e6'] },
  { id: 2, name: 'Caramel Meadow', firstLevel: 11, lastLevel: 20, sky: ['#fff0d9', '#ffe2c2'] },
  { id: 3, name: 'Minty Grove', firstLevel: 21, lastLevel: 30, sky: ['#dcf8ec', '#e3f0ff'] },
];

export function worldOf(levelId: number): World {
  return WORLDS.find((w) => levelId >= w.firstLevel && levelId <= w.lastLevel) ?? WORLDS[WORLDS.length - 1]!;
}

const isInt = (v: unknown, min = -Infinity): v is number => Number.isInteger(v) && (v as number) >= min;

/** Checks a level file thoroughly; throws with the reason so broken data fails fast in tests and dev. */
export function validateLevel(raw: unknown): LevelConfig {
  const l = raw as Partial<LevelConfig>;
  const fail = (why: string): never => {
    throw new Error(`level ${String(l?.id)}: ${why}`);
  };
  if (!isInt(l.id, 1)) fail('id must be a positive integer');
  if (typeof l.name !== 'string' || l.name === '') fail('name is required');
  if (!Array.isArray(l.shape) || l.shape.length < 3 || l.shape.length > 10) fail('shape must have 3-10 rows');
  const cols = l.shape![0]!.length;
  if (cols < 3 || cols > 10 || l.shape!.some((r) => typeof r !== 'string' || r.length !== cols))
    fail('shape rows must be equal, 3-10 wide');
  if (!isInt(l.colors, 3) || l.colors! > MAX_COLORS) fail(`colors must be 3..${MAX_COLORS}`);
  if (!isInt(l.moves, 1)) fail('moves must be positive');
  const stars = l.stars;
  if (!Array.isArray(stars) || stars.length !== 3 || !stars.every((s) => isInt(s, 1)) || !(stars[0] < stars[1] && stars[1] < stars[2])) {
    fail('stars must be three increasing positive scores');
  }
  if (!Array.isArray(l.goals) || l.goals.length === 0) fail('at least one goal is required');
  for (const g of l.goals as GoalConfig[]) {
    if (g.kind === 'score') {
      if (!isInt(g.target, 1)) fail('score goal needs a target');
    } else if (g.kind === 'collect') {
      if (!isInt(g.color, 0) || g.color >= l.colors!) fail('collect goal color must be in the level palette');
      if (!isInt(g.count, 1)) fail('collect goal needs a count');
    } else if (g.kind === 'jelly') {
      if (!l.jelly) fail('jelly goal needs a jelly map');
    } else {
      fail(`unknown goal kind ${(g as { kind: string }).kind}`);
    }
  }
  if (l.jelly) {
    if (
      l.jelly.length !== l.shape!.length ||
      l.jelly.some((r, i) => r.length !== cols || [...r].some((ch, c) => ch !== '.' && l.shape![i]![c] === '#'))
    ) {
      fail('jelly map must match the shape and avoid holes');
    }
    if (!l.jelly.some((r) => /[1-9]/.test(r))) fail('jelly map has no jelly');
  }
  return l as LevelConfig;
}

const files = import.meta.glob<{ default: unknown }>('./levels/level-*.json', { eager: true });

export const LEVELS: readonly LevelConfig[] = Object.values(files)
  .map((m) => validateLevel(m.default))
  .sort((a, b) => a.id - b.id);

export function levelById(id: number): LevelConfig | undefined {
  return LEVELS.find((l) => l.id === id);
}
