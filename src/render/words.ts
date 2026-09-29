import type { Effect } from '../engine';

/** Cheers for chain reactions, by cascade depth (index 0 = cascade 2). All original to Sugar Bloom. */
const CASCADE_WORDS = ['Yum!', 'Juicy!', 'Blooming!', 'Sugarific!', 'Petal Party!'] as const;

/** Cheers for combo swaps. */
const COMBO_WORDS: Partial<Record<Effect, string>> = {
  cross: 'Criss-Cross!',
  tripleCross: 'Candy Storm!',
  megaBurst: 'Bloom Boom!',
  prismLines: 'Rainbow Rush!',
  prismBursts: 'Rainbow Rush!',
  boardWipe: 'Garden Glory!',
};

export function cascadeWord(cascade: number): string | null {
  if (cascade < 2) return null;
  return CASCADE_WORDS[Math.min(cascade - 2, CASCADE_WORDS.length - 1)]!;
}

export function comboWord(effect: Effect): string | null {
  return COMBO_WORDS[effect] ?? null;
}
