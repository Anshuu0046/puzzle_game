import type { PlacedPiece } from './events';
import type { Color } from './types';

/**
 * What a level asks for. A level is won the moment every goal is complete.
 * - score: reach `target` points
 * - collect: clear `count` pieces of `color` (specials of that color count too)
 * - jelly: clear every jelly layer on the board
 */
export type GoalConfig =
  | { readonly kind: 'score'; readonly target: number }
  | { readonly kind: 'collect'; readonly color: Color; readonly count: number }
  | { readonly kind: 'jelly' };

export interface GoalProgress {
  readonly kind: GoalConfig['kind'];
  /** Collect goals only. */
  readonly color?: Color;
  readonly target: number;
  /** Progress so far, capped at target. */
  readonly done: number;
}

export class GoalTracker {
  private score = 0;
  private jellyCleared = 0;
  private readonly collected = new Map<Color, number>();

  constructor(
    private readonly goals: readonly GoalConfig[],
    private readonly jellyAtStart: number,
  ) {}

  recordCleared(pieces: readonly PlacedPiece[]): void {
    for (const { piece } of pieces) {
      if (piece.color !== null) this.collected.set(piece.color, (this.collected.get(piece.color) ?? 0) + 1);
    }
  }

  recordJelly(layers: number): void {
    this.jellyCleared += layers;
  }

  setScore(score: number): void {
    this.score = score;
  }

  progress(): GoalProgress[] {
    return this.goals.map((g): GoalProgress => {
      switch (g.kind) {
        case 'score':
          return { kind: 'score', target: g.target, done: Math.min(g.target, this.score) };
        case 'collect':
          return { kind: 'collect', color: g.color, target: g.count, done: Math.min(g.count, this.collected.get(g.color) ?? 0) };
        case 'jelly':
          return { kind: 'jelly', target: this.jellyAtStart, done: Math.min(this.jellyAtStart, this.jellyCleared) };
      }
    });
  }

  complete(): boolean {
    return this.progress().every((g) => g.done >= g.target);
  }
}

/** 0-3 stars from score thresholds; a won level always earns at least one. */
export function starRating(score: number, thresholds: readonly [number, number, number], won: boolean): number {
  const stars = thresholds.filter((t) => score >= t).length;
  return won ? Math.max(1, stars) : stars;
}
