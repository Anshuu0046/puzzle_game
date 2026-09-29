import { LEVELS, WORLDS, type World } from '../data/levels';
import type { SaveStore } from '../data/save';
import { clear, h, svg } from './dom';
import { BACK_SVG, GEAR_SVG, LOCK_SVG, STAR_EMPTY_SVG, STAR_SVG } from './icons';

/** Vertical distance between level nodes, px (8px grid). */
const STEP = 104;
const WORLD_HEADER = 96;
const WORLD_PAD = 48;

/** Horizontal wiggle of the path, as a fraction of the width. */
const nodeX = (id: number) => 0.5 + Math.sin(id * 0.9) * 0.28;

const LOLLIPOP = (a: string, b: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100"><rect x="27" y="44" width="6" height="54" rx="3" fill="#f5e6c8"/><circle cx="30" cy="30" r="26" fill="${a}"/><path d="M30 30 m-18 0 a18 18 0 1 1 36 0 a12 12 0 1 1 -24 0 a6 6 0 1 1 12 0" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/><ellipse cx="20" cy="18" rx="7" ry="4" fill="#fff" opacity="0.6"/></svg>`;
const FLOWER = (a: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">${[0, 72, 144, 216, 288]
    .map((r) => `<ellipse cx="30" cy="14" rx="9" ry="13" fill="${a}" transform="rotate(${r} 30 30)"/>`)
    .join('')}<circle cx="30" cy="30" r="8" fill="#ffd43b"/><circle cx="27" cy="27" r="3" fill="#fff" opacity="0.7"/></svg>`;
const MUSHROOM = (a: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect x="22" y="30" width="16" height="24" rx="7" fill="#fff4e0"/><path d="M6 34 Q30 0 54 34 Z" fill="${a}"/><circle cx="20" cy="22" r="4" fill="#fff"/><circle cx="36" cy="16" r="3" fill="#fff"/><circle cx="42" cy="27" r="3.5" fill="#fff"/></svg>`;

const DECOR: Record<number, readonly string[]> = {
  1: [LOLLIPOP('#ff8fb8', '#fff'), FLOWER('#ffb3cf'), MUSHROOM('#ff6f9f')],
  2: [LOLLIPOP('#ffb561', '#fff3dc'), FLOWER('#ffd08a'), MUSHROOM('#e8913c')],
  3: [LOLLIPOP('#5fd6a4', '#e8fff4'), FLOWER('#9fe3c8'), MUSHROOM('#4aa8ff')],
};

/** Scrolling world map: level 1 at the bottom, winding upward through each garden. */
export class MapScreen {
  readonly el: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly track: HTMLElement;
  private readonly starCount: HTMLElement;
  private save: SaveStore | null = null;

  constructor(
    private readonly onSelect: (levelId: number) => void,
    onBack: () => void,
    onSettings: () => void,
  ) {
    const back = h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Back to title', onclick: onBack });
    back.append(svg(BACK_SVG));
    const settings = h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Settings', onclick: onSettings });
    settings.append(svg(GEAR_SVG));
    this.starCount = h('span', { class: 'map__stars-value' });
    const starPill = h('div', { class: 'map__stars', 'aria-label': 'Stars collected' }, svg(STAR_SVG, 'map__stars-icon'), this.starCount);
    this.track = h('div', { class: 'map__track' });
    this.scroller = h('div', { class: 'map__scroll' }, this.track);
    this.el = h(
      'section',
      { class: 'screen map', 'aria-label': 'World map' },
      h('header', { class: 'map__bar' }, back, starPill, settings),
      this.scroller,
    );
    window.addEventListener('resize', () => {
      if (this.save && !this.el.hidden) this.render(this.save);
    });
  }

  /** Rebuilds the map for the current progress. */
  render(save: SaveStore): void {
    this.save = save;
    clear(this.track);
    const width = this.track.clientWidth || this.el.clientWidth || window.innerWidth;
    const unlocked = save.unlockedUpTo;
    this.starCount.textContent = `${save.totalStars} / ${LEVELS.length * 3}`;

    const worldHeight = (w: World) => WORLD_HEADER + (w.lastLevel - w.firstLevel + 1) * STEP + WORLD_PAD;
    const total = WORLDS.reduce((sum, w) => sum + worldHeight(w), 0);
    this.track.style.height = `${total}px`;

    // Worlds stack upward: the first world sits at the bottom of the track.
    let bottom = 0;
    const centers = new Map<number, { x: number; y: number }>();
    for (const world of WORLDS) {
      const height = worldHeight(world);
      const top = total - bottom - height;
      const section = h('div', { class: `map__world map__world--${world.id}` });
      section.style.top = `${top}px`;
      section.style.height = `${height}px`;
      section.style.background = `linear-gradient(180deg, ${world.sky[1]}, ${world.sky[0]})`;
      section.append(h('div', { class: 'map__banner' }, h('span', {}, world.name)));
      const decor = DECOR[world.id] ?? DECOR[1]!;
      for (let i = world.firstLevel; i <= world.lastLevel; i++) {
        const y = height - WORLD_PAD / 2 - (i - world.firstLevel + 0.5) * STEP;
        centers.set(i, { x: nodeX(i) * width, y: top + y });
        // Decorations on the side the path is not on.
        const art = decor[i % decor.length]!;
        const d = svg(art, 'map__decor');
        const side = nodeX(i) > 0.5 ? 0.14 : 0.86;
        d.style.left = `${side * 100}%`;
        d.style.top = `${y - 28}px`;
        section.append(d);
      }
      this.track.append(section);
      bottom += height;
    }

    // Candy path through every node.
    const points = LEVELS.map((l) => centers.get(l.id)!);
    const d = points
      .map((p, i) => {
        if (i === 0) return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        const prev = points[i - 1]!;
        const midY = (prev.y + p.y) / 2;
        return `C${prev.x.toFixed(1)} ${midY.toFixed(1)} ${p.x.toFixed(1)} ${midY.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(' ');
    this.track.append(
      svg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}"><path d="${d}" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" opacity="0.9"/><path d="${d}" fill="none" stroke="#ffb3cf" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 18"/></svg>`,
        'map__path',
      ),
    );

    for (const level of LEVELS) {
      const c = centers.get(level.id)!;
      const record = save.record(level.id);
      const locked = level.id > unlocked;
      const current = level.id === unlocked;
      const stars = record?.stars ?? 0;
      const node = h(
        'button',
        {
          class: `map-node${locked ? ' map-node--locked' : ''}${current ? ' map-node--current' : ''}${stars > 0 ? ' map-node--done' : ''}`,
          type: 'button',
          disabled: locked,
          'aria-label': locked ? `Level ${level.id}, locked` : `Level ${level.id}${stars ? `, ${stars} of 3 stars` : ''}`,
          onclick: () => this.onSelect(level.id),
        },
        locked ? svg(LOCK_SVG, 'map-node__lock') : h('span', { class: 'map-node__num' }, String(level.id)),
      );
      if (!locked) {
        const row = h('span', { class: 'map-node__stars' });
        for (let s = 0; s < 3; s++) row.append(svg(s < stars ? STAR_SVG : STAR_EMPTY_SVG));
        node.append(row);
      }
      node.style.left = `${c.x}px`;
      node.style.top = `${c.y}px`;
      this.track.append(node);
    }
  }

  /** Scrolls so the given level sits a little below the middle of the view. */
  scrollToLevel(levelId: number, smooth = false): void {
    const node = this.track.querySelectorAll<HTMLElement>('.map-node')[levelId - 1];
    if (!node) return;
    const target = node.offsetTop - this.scroller.clientHeight * 0.6;
    this.scroller.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
  }

  focusLevel(levelId: number): void {
    this.track.querySelectorAll<HTMLElement>('.map-node')[levelId - 1]?.focus({ preventScroll: true });
  }
}
