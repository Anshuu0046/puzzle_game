import { gsap } from 'gsap';
import type { GoalProgress, LevelConfig } from '../engine';
import { COLOR_NAMES } from '../engine';
import { clear, h, svg } from './dom';
import { CHECK_SVG, JELLY_SVG, PAUSE_SVG, SCORE_SVG, STAR_SVG, pieceImage } from './icons';

export function goalIcon(goal: Pick<GoalProgress, 'kind' | 'color'>, className: string): Element {
  if (goal.kind === 'collect') return h('img', { class: className, src: pieceImage(goal.color ?? 0), alt: '' });
  return svg(goal.kind === 'jelly' ? JELLY_SVG : SCORE_SVG, className);
}

export function goalLabel(goal: GoalProgress): string {
  switch (goal.kind) {
    case 'collect':
      return `Collect ${goal.target} ${COLOR_NAMES[goal.color ?? 0]}`;
    case 'jelly':
      return `Clear all ${goal.target} jelly`;
    case 'score':
      return `Score ${goal.target.toLocaleString()}`;
  }
}

/** Top bar during a level: pause, moves, goals, score with a three-star meter. */
export class Hud {
  readonly el: HTMLElement;
  private readonly moves: HTMLElement;
  private readonly score: HTMLElement;
  private readonly goals: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly shown = { score: 0 };
  private stars: readonly [number, number, number] = [1, 2, 3];
  private goalEls: { value: HTMLElement; chip: HTMLElement }[] = [];

  constructor(el: HTMLElement, onPause: () => void) {
    this.el = el;
    this.moves = h('span', { class: 'hud__value', 'aria-live': 'polite' }, '0');
    this.score = h('span', { class: 'hud__value' }, '0');
    this.goals = h('div', { class: 'hud__goals' });
    this.fill = h('div', { class: 'hud__fill' });
    this.meter = h('div', { class: 'hud__track' }, this.fill);
    const pause = h('button', { class: 'hud__pause icon-button', type: 'button', 'aria-label': 'Pause', onclick: () => onPause() });
    pause.append(svg(PAUSE_SVG));
    el.append(
      pause,
      h('div', { class: 'hud__pill hud__moves' }, h('span', { class: 'hud__label' }, 'Moves'), this.moves),
      h('div', { class: 'hud__pill hud__goal' }, this.goals, this.meter),
      h('div', { class: 'hud__pill hud__score' }, h('span', { class: 'hud__label' }, 'Score'), this.score),
    );
  }

  setLevel(level: LevelConfig, goals: readonly GoalProgress[]): void {
    this.stars = level.stars;
    clear(this.goals);
    this.goalEls = goals.map((g) => {
      const value = h('span', { class: 'hud__goal-value' });
      const chip = h('div', { class: 'hud__chip', title: goalLabel(g) }, goalIcon(g, 'hud__goal-icon'), value);
      this.goals.append(chip);
      return { value, chip };
    });
    // Star markers at each threshold along the meter (the bar tops out at 3 stars).
    this.meter.querySelectorAll('.hud__star').forEach((s) => s.remove());
    for (const t of level.stars) {
      const marker = h('span', { class: 'hud__star' });
      marker.append(svg(STAR_SVG));
      marker.style.left = `${(t / level.stars[2]) * 100}%`;
      this.meter.append(marker);
    }
    this.setGoals(goals);
  }

  setGoals(goals: readonly GoalProgress[]): void {
    goals.forEach((g, i) => {
      const els = this.goalEls[i];
      if (!els) return;
      const left = Math.max(0, g.target - g.done);
      const done = left === 0;
      if (els.chip.classList.contains('hud__chip--done') !== done) {
        els.chip.classList.toggle('hud__chip--done', done);
        clear(els.value);
        if (done) els.value.append(svg(CHECK_SVG, 'hud__check'));
      }
      if (!done) els.value.textContent = g.kind === 'score' ? left.toLocaleString() : String(left);
    });
  }

  setMoves(moves: number): void {
    this.moves.textContent = String(moves);
    this.moves.parentElement?.classList.toggle('hud__moves--low', moves <= 5);
  }

  /** Counts the score up with an ease-out and fills the star meter. */
  setScore(score: number, animate = true): void {
    gsap.killTweensOf(this.shown);
    const render = () => {
      this.score.textContent = Math.round(this.shown.score).toLocaleString();
      this.fill.style.width = `${Math.min(100, (this.shown.score / this.stars[2]) * 100)}%`;
      this.meter.querySelectorAll<HTMLElement>('.hud__star').forEach((s, i) => s.classList.toggle('hud__star--lit', this.shown.score >= this.stars[i]!));
    };
    if (!animate) {
      this.shown.score = score;
      render();
      return;
    }
    gsap.to(this.shown, { score, duration: 0.5, ease: 'power2.out', onUpdate: render });
  }

  show(visible: boolean): void {
    this.el.hidden = !visible;
  }
}
