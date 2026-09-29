import { gsap } from 'gsap';

/** Top bar: moves left, level name with progress toward the target, and score. */
export class Hud {
  readonly el: HTMLElement;
  private readonly moves: HTMLElement;
  private readonly score: HTMLElement;
  private readonly title: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly target: HTMLElement;
  private readonly shown = { score: 0 };
  private targetScore = 1;

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = `
      <div class="hud__pill"><span class="hud__label">Moves</span><span class="hud__value" data-moves>0</span></div>
      <div class="hud__pill hud__goal">
        <div class="hud__title" data-title></div>
        <div class="hud__track"><div class="hud__fill" data-fill></div></div>
        <div class="hud__target" data-target></div>
      </div>
      <div class="hud__pill"><span class="hud__label">Score</span><span class="hud__value" data-score>0</span></div>`;
    this.moves = el.querySelector('[data-moves]')!;
    this.score = el.querySelector('[data-score]')!;
    this.title = el.querySelector('[data-title]')!;
    this.fill = el.querySelector('[data-fill]')!;
    this.target = el.querySelector('[data-target]')!;
  }

  setLevel(name: string, targetScore: number): void {
    this.title.textContent = name;
    this.targetScore = targetScore;
    this.target.textContent = `Goal ${targetScore.toLocaleString()}`;
  }

  setMoves(moves: number): void {
    this.moves.textContent = String(moves);
  }

  /** Counts the score up with an ease-out. */
  setScore(score: number, animate = true): void {
    gsap.killTweensOf(this.shown);
    const render = () => {
      this.score.textContent = Math.round(this.shown.score).toLocaleString();
      this.fill.style.width = `${Math.min(100, (this.shown.score / this.targetScore) * 100)}%`;
    };
    if (!animate) {
      this.shown.score = score;
      render();
      return;
    }
    gsap.to(this.shown, { score, duration: 0.5, ease: 'power2.out', onUpdate: render });
  }
}
