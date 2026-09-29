import { h, svg } from './dom';
import { GEAR_SVG, pieceImage } from './icons';

/** Decorative sweets drifting around the logo: [color (null = prism), left %, top %, size px, delay s]. */
const FLOATERS: readonly [number | null, number, number, number, number][] = [
  [0, 8, 12, 56, 0],
  [2, 78, 8, 64, 1.2],
  [4, 86, 38, 48, 0.4],
  [3, 6, 46, 52, 2],
  [null, 70, 62, 60, 0.8],
  [1, 14, 74, 58, 1.6],
  [5, 82, 80, 50, 2.4],
  [2, 40, 88, 40, 0.6],
];

/** Title screen: logo, drifting sweets, Play. */
export class TitleScreen {
  readonly el: HTMLElement;

  constructor(onPlay: () => void, onSettings: () => void) {
    const floaters = FLOATERS.map(([color, left, top, size, delay]) => {
      const img = h('img', { class: 'title__sweet', src: pieceImage(color), alt: '', width: size, height: size });
      img.style.left = `${left}%`;
      img.style.top = `${top}%`;
      img.style.animationDelay = `${delay}s`;
      return img;
    });
    const settings = h('button', { class: 'icon-button title__settings', type: 'button', 'aria-label': 'Settings', onclick: onSettings });
    settings.append(svg(GEAR_SVG));
    this.el = h(
      'section',
      { class: 'screen title', 'aria-label': 'Sugar Bloom' },
      ...floaters,
      settings,
      h(
        'div',
        { class: 'title__center' },
        h('h1', { class: 'title__logo' }, h('span', { class: 'title__sugar' }, 'Sugar'), h('span', { class: 'title__bloom' }, 'Bloom')),
        h('p', { class: 'title__tagline' }, 'A sweet match-3 garden adventure'),
        h('button', { class: 'button button--big', type: 'button', onclick: onPlay }, 'Play'),
      ),
    );
  }
}
