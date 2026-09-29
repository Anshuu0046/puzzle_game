import type { GoalProgress, LevelConfig } from '../engine';
import type { LevelRecord, Settings } from '../data/save';
import { h, svg } from './dom';
import { goalIcon, goalLabel } from './hud';
import { STAR_EMPTY_SVG, STAR_SVG } from './icons';

const button = (label: string, onclick: () => void, kind: 'primary' | 'secondary' | 'text' = 'primary') =>
  h('button', { class: `button button--${kind}`, type: 'button', onclick }, label);

function starRow(filled: number, animated: boolean, big = false): HTMLElement {
  const row = h('div', { class: `stars${big ? ' stars--big' : ''}`, role: 'img', 'aria-label': `${filled} of 3 stars` });
  for (let i = 0; i < 3; i++) {
    const slot = h('span', { class: 'stars__slot' }, svg(STAR_EMPTY_SVG, 'stars__empty'));
    if (i < filled) {
      const star = svg(STAR_SVG, `stars__full${animated ? ' stars__full--pop' : ''}`);
      star.style.animationDelay = animated ? `${0.3 + i * 0.35}s` : '0s';
      slot.append(star);
    }
    row.append(slot);
  }
  return row;
}

function goalList(goals: readonly GoalProgress[], showProgress: boolean): HTMLElement {
  return h(
    'ul',
    { class: 'goal-list' },
    ...goals.map((g) =>
      h(
        'li',
        { class: `goal-list__item${showProgress && g.done >= g.target ? ' goal-list__item--done' : ''}` },
        goalIcon(g, 'goal-list__icon'),
        h('span', {}, goalLabel(g)),
        showProgress ? h('span', { class: 'goal-list__progress' }, g.kind === 'score' ? '' : `${g.done}/${g.target}`) : null,
      ),
    ),
  );
}

function toggle(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const el = h(
    'button',
    { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(on) },
    h('span', { class: 'toggle__label' }, label),
    h('span', { class: 'toggle__track' }, h('span', { class: 'toggle__thumb' })),
  );
  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return el;
}

export function introContent(level: LevelConfig, goals: readonly GoalProgress[], record: LevelRecord | undefined, onPlay: () => void, onBack: () => void): Node[] {
  return [
    h('p', { class: 'modal__eyebrow' }, level.name),
    h('h2', { class: 'modal__title' }, `Level ${level.id}`),
    starRow(record?.stars ?? 0, false),
    h('p', { class: 'modal__text' }, `${level.moves} moves to:`),
    goalList(goals, false),
    h('div', { class: 'modal__actions' }, button('Play', onPlay), button('Back to map', onBack, 'text')),
  ];
}

export interface PauseActions {
  onResume: () => void;
  onRestart: () => void;
  onMap: () => void;
  onSfx: (on: boolean) => void;
  onMusic: (on: boolean) => void;
}

export function pauseContent(level: LevelConfig, goals: readonly GoalProgress[], settings: Settings, a: PauseActions): Node[] {
  return [
    h('h2', { class: 'modal__title' }, 'Paused'),
    h('p', { class: 'modal__eyebrow' }, `Level ${level.id} · ${level.name}`),
    goalList(goals, true),
    h('div', { class: 'modal__toggles' }, toggle('Sound effects', settings.sfx, a.onSfx), toggle('Music', settings.music, a.onMusic)),
    h('div', { class: 'modal__actions' }, button('Resume', a.onResume), button('Restart level', a.onRestart, 'secondary'), button('World map', a.onMap, 'text')),
  ];
}

export interface WinActions {
  onNext: (() => void) | null;
  onReplay: () => void;
  onMap: () => void;
}

export function winContent(level: LevelConfig, score: number, stars: number, newBest: boolean, a: WinActions): Node[] {
  return [
    h('p', { class: 'modal__eyebrow' }, `Level ${level.id}`),
    h('h2', { class: 'modal__title modal__title--win' }, 'Garden in Bloom!'),
    starRow(stars, true, true),
    h('p', { class: 'modal__score' }, score.toLocaleString()),
    newBest ? h('p', { class: 'badge' }, 'New best!') : null,
    h(
      'div',
      { class: 'modal__actions' },
      a.onNext ? button('Next level', a.onNext) : h('p', { class: 'modal__text' }, 'You finished every garden. More coming soon!'),
      button('Play again', a.onReplay, a.onNext ? 'secondary' : 'primary'),
      button('World map', a.onMap, 'text'),
    ),
  ].filter((n): n is HTMLElement => n !== null);
}

export function loseContent(level: LevelConfig, goals: readonly GoalProgress[], onRetry: () => void, onMap: () => void): Node[] {
  return [
    h('p', { class: 'modal__eyebrow' }, `Level ${level.id}`),
    h('h2', { class: 'modal__title' }, 'Out of Moves'),
    h('p', { class: 'modal__text' }, 'So close! Still left to do:'),
    goalList(goals, true),
    h('div', { class: 'modal__actions' }, button('Try again', onRetry), button('World map', onMap, 'text')),
  ];
}

export interface SettingsActions {
  onSfx: (on: boolean) => void;
  onMusic: (on: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

export function settingsContent(settings: Settings, a: SettingsActions): Node[] {
  let armed = false;
  const reset = button('Reset progress', () => {
    if (!armed) {
      armed = true;
      reset.textContent = 'Tap again to erase all progress';
      return;
    }
    a.onReset();
  }, 'text');
  return [
    h('h2', { class: 'modal__title' }, 'Settings'),
    h('div', { class: 'modal__toggles' }, toggle('Sound effects', settings.sfx, a.onSfx), toggle('Music', settings.music, a.onMusic)),
    h('div', { class: 'modal__actions' }, button('Done', a.onClose), reset),
  ];
}
