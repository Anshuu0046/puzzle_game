import { h, uiRoot } from './dom';
import { t, hasKey } from '../core/i18n';
import { ITEMS } from '../data/items';

/** Minimal in-game HUD: crosshair, prompt, objective, stamina, battery, subtitles, toasts, pickups. */
export class Hud {
  readonly el: HTMLDivElement;
  private readonly cross: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly promptText: HTMLSpanElement;
  private readonly objective: HTMLDivElement;
  private readonly objText: HTMLSpanElement;
  private readonly stamina: HTMLDivElement;
  private readonly staminaFill: HTMLElement;
  private readonly battery: HTMLDivElement;
  private readonly batteryFill: HTMLElement;
  private readonly invPulse: HTMLDivElement;
  private readonly subs: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private readonly pickups: HTMLDivElement;
  private readonly chapter: HTMLDivElement;
  private readonly hideHint: HTMLDivElement;
  private readonly breathFill: HTMLElement;
  private readonly saveIcon: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  private objTimer = 0;
  private toastTimer = 0;
  subtitlesOn = true;
  private lastPrompt = '';

  constructor(touch: boolean) {
    this.cross = h('div', { class: 'crosshair' });
    this.promptText = h('span');
    this.prompt = h('div', { class: 'prompt' }, h('kbd', {}, 'E'), this.promptText);
    this.objText = h('span');
    this.objective = h('div', { class: 'objective' }, h('small', {}, t('hud.objective')), this.objText);
    this.staminaFill = h('i');
    this.stamina = h('div', { class: 'stamina' }, this.staminaFill);
    this.batteryFill = h('i');
    this.battery = h('div', { class: 'battery' }, h('div', { class: 'cell' }, this.batteryFill));
    this.invPulse = h('div', { class: 'inv-pulse' }, 'INVENTORY +1');
    this.subs = h('div', { class: 'subtitles' });
    this.toastEl = h('div', { class: 'toast' });
    this.pickups = h('div', { class: 'pickup' });
    this.chapter = h('div', { class: 'chapter-card' });
    this.breathFill = h('i');
    this.hideHint = h(
      'div',
      { class: 'hide-hint', style: 'display:none' },
      h('span', {}, touch ? '' : '[E] ' + t('hud.leaveHide')),
      h('span', {}, touch ? t('hud.holdBreath') : '[SPACE] ' + t('hud.holdBreath')),
      h('div', { class: 'breath' }, this.breathFill),
    );
    this.saveIcon = h('div', { class: 'save-icon' }, t('hud.autosaved'));
    this.fps = h('div', { class: 'fps', style: 'display:none' });
    this.el = h(
      'div',
      { class: `hud ${touch ? 'touch' : ''}` },
      this.cross,
      this.prompt,
      this.objective,
      h('div', { class: 'meters' }, this.stamina),
      h('div', { class: 'status' }, this.invPulse, this.battery),
      this.subs,
      this.toastEl,
      this.pickups,
      this.chapter,
      this.hideHint,
      this.saveIcon,
      this.fps,
    );
    uiRoot().append(this.el);
    this.el.style.display = 'none';
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }

  setTouch(touch: boolean): void {
    this.el.classList.toggle('touch', touch);
  }

  setPrompt(key: string | null): void {
    const k = key ?? '';
    this.cross.classList.toggle('active', !!key);
    if (k === this.lastPrompt) return;
    this.lastPrompt = k;
    if (key) this.promptText.textContent = t(`prompt.${key}`);
    this.prompt.classList.toggle('show', !!key);
  }

  setObjective(text: string, flash = true): void {
    this.objText.textContent = text;
    if (flash) {
      this.objective.classList.add('show');
      this.objTimer = 9;
    }
  }

  peekObjective(): void {
    this.objective.classList.add('show');
    this.objTimer = 5;
  }

  setStamina(v: number): void {
    this.stamina.classList.toggle('show', v < 0.99);
    this.stamina.classList.toggle('low', v < 0.25);
    this.staminaFill.style.width = `${Math.round(v * 100)}%`;
  }

  setBattery(v: number, on: boolean): void {
    this.batteryFill.style.width = `${Math.round(v * 100)}%`;
    this.battery.classList.toggle('low', v < 0.15);
    this.battery.style.opacity = on ? '1' : '0.45';
  }

  setHiding(on: boolean, breath: number): void {
    this.hideHint.style.display = on ? '' : 'none';
    this.breathFill.style.width = `${Math.round(breath * 100)}%`;
  }

  subtitle(text: string, duration = 4, speaker?: string): void {
    if (!this.subtitlesOn) return;
    const p = h('p', {});
    if (speaker) p.append(h('b', {}, `${speaker}: `));
    p.append(hasKey(text) ? t(text) : text);
    const wrap = h('div', {}, p);
    this.subs.append(wrap);
    while (this.subs.children.length > 2) this.subs.firstElementChild?.remove();
    setTimeout(() => wrap.remove(), duration * 1000);
  }

  toast(text: string, duration = 3.5): void {
    this.toastEl.textContent = hasKey(text) ? t(text) : text;
    this.toastEl.classList.add('show');
    this.toastTimer = duration;
  }

  pickup(id: string): void {
    const def = ITEMS[id];
    if (!def) return;
    const row = h(
      'div',
      { class: def.evidence ? 'evidence' : '' },
      h('span', { html: def.icon }),
      h('span', {}, h('small', {}, def.evidence ? t('hud.newEvidence') : t('hud.newItem')), def.name),
    );
    this.pickups.append(row);
    setTimeout(() => row.remove(), 4200);
    this.invPulse.classList.add('show');
    setTimeout(() => this.invPulse.classList.remove('show'), 2500);
  }

  chapterCard(num: string, title: string, sub = ''): void {
    this.chapter.replaceChildren(h('small', {}, num), h('h1', {}, title), sub ? h('p', {}, sub) : '');
    this.chapter.classList.add('show');
    setTimeout(() => this.chapter.classList.remove('show'), 4200);
  }

  saved(text = t('hud.autosaved')): void {
    this.saveIcon.textContent = text;
    this.saveIcon.classList.add('show');
    setTimeout(() => this.saveIcon.classList.remove('show'), 2200);
  }

  setFps(text: string | null): void {
    this.fps.style.display = text ? '' : 'none';
    if (text) this.fps.textContent = text;
  }

  update(dt: number): void {
    if (this.objTimer > 0) {
      this.objTimer -= dt;
      if (this.objTimer <= 0) this.objective.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }
}
