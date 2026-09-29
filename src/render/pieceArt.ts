import { Texture } from 'pixi.js';
import type { Piece, Special } from '../engine';
import { PIECE_COLORS, type PieceColors } from './theme';

/**
 * Procedural piece art: each sweet is an SVG (gradient body, gloss, sparkle, soft shadow) rasterized
 * to a canvas at the exact device-pixel size it is drawn at. Every color has its own silhouette so the
 * board stays readable for color-blind players.
 */

const STAR = starPoints(50, 52, 5, 38, 20);
const HEX = polygonPoints(50, 50, 6, 36, Math.PI / 6);

/** Body shapes in a 100x100 box. Polygons get a thick round-joined stroke to soften the corners. */
const SHAPES: readonly ((fill: string) => string)[] = [
  // berry: heart
  (f) => `<path d="M50 84 C 22 66 10 48 18 31 C 26 15 44 16 50 30 C 56 16 74 15 82 31 C 90 48 78 66 50 84 Z" fill="${f}"/>`,
  // citrus: rounded square
  (f) => `<rect x="16" y="16" width="68" height="68" rx="22" fill="${f}"/>`,
  // lemon: plump star
  (f) => `<polygon points="${STAR}" fill="${f}" stroke="${f}" stroke-width="14" stroke-linejoin="round"/>`,
  // mint: hexagon
  (f) => `<polygon points="${HEX}" fill="${f}" stroke="${f}" stroke-width="12" stroke-linejoin="round"/>`,
  // bluebell: round gum drop
  (f) => `<circle cx="50" cy="50" r="35" fill="${f}"/>`,
  // plum: diamond
  (f) => `<polygon points="50,14 86,50 50,86 14,50" fill="${f}" stroke="${f}" stroke-width="12" stroke-linejoin="round"/>`,
];

type Variant = 'none' | 'lineH' | 'lineV' | 'burst';

/** SVG for a colored piece, optionally dressed as a Line Blaster or Burst Bomb. */
export function pieceSvg(color: number, variant: Variant = 'none'): string {
  const c: PieceColors = PIECE_COLORS[color]!;
  const shape = SHAPES[color]!;
  const bodyScale = variant === 'burst' ? 0.8 : 1;
  const body = `<g transform="translate(50 50) scale(${bodyScale}) translate(-50 -50)">`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <radialGradient id="body" cx="38%" cy="30%" r="75%">
      <stop offset="0" stop-color="${c.light}"/>
      <stop offset="0.45" stop-color="${c.base}"/>
      <stop offset="1" stop-color="${c.dark}"/>
    </radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${c.light}" stop-opacity="0.2"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="${c.dark}" flood-opacity="0.45"/>
    </filter>
    <clipPath id="clip">${shape('#000')}</clipPath>
  </defs>
  ${variant === 'burst' ? burstHalo(c) : ''}
  ${body}
    <g filter="url(#shadow)">${shape('url(#body)')}</g>
    <g clip-path="url(#clip)">
      <ellipse cx="50" cy="86" rx="40" ry="16" fill="${c.dark}" opacity="0.25"/>
      ${variant === 'lineH' || variant === 'lineV' ? stripes(variant, c) : ''}
      <ellipse cx="44" cy="32" rx="24" ry="13" fill="url(#gloss)" transform="rotate(-18 44 32)"/>
    </g>
    <circle cx="68" cy="30" r="4" fill="#fff" opacity="0.85"/>
  </g>
</svg>`;
}

/** Candy-cane stripes across the body: horizontal for a row blaster, vertical for a column blaster. */
function stripes(variant: 'lineH' | 'lineV', c: PieceColors): string {
  const bars = [30, 50, 70]
    .map((at) =>
      variant === 'lineH'
        ? `<rect x="0" y="${at - 5}" width="100" height="10" rx="5"/>`
        : `<rect x="${at - 5}" y="0" width="10" height="100" rx="5"/>`,
    )
    .join('');
  return `<g fill="#fff" opacity="0.85" stroke="${c.dark}" stroke-opacity="0.25" stroke-width="1.5">${bars}</g>`;
}

/** Frosted starburst wrapper behind a Burst Bomb. */
function burstHalo(c: PieceColors): string {
  return `<polygon points="${starPoints(50, 50, 10, 49, 38)}" fill="url(#halo)" stroke="${c.base}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="36" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 5" opacity="0.9"/>`;
}

/** The colorless Prism Orb: a glossy sphere of candy-colored petals. */
export function prismSvg(): string {
  const wedges = PIECE_COLORS.map((c, i) => {
    const a0 = (i / PIECE_COLORS.length) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / PIECE_COLORS.length) * Math.PI * 2 - Math.PI / 2;
    const p = (a: number) => `${(50 + 40 * Math.cos(a)).toFixed(2)} ${(50 + 40 * Math.sin(a)).toFixed(2)}`;
    return `<path d="M50 50 L${p(a0)} A40 40 0 0 1 ${p(a1)} Z" fill="${c.base}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.35" stop-color="#fff" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rim" cx="50%" cy="50%" r="50%">
      <stop offset="0.75" stop-color="#4a2350" stop-opacity="0"/>
      <stop offset="1" stop-color="#4a2350" stop-opacity="0.45"/>
    </radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#6a32c4" flood-opacity="0.45"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="2.2"/></filter>
    <clipPath id="clip"><circle cx="50" cy="50" r="40"/></clipPath>
  </defs>
  <g filter="url(#shadow)"><circle cx="50" cy="50" r="40" fill="#fff"/></g>
  <g clip-path="url(#clip)">
    <g filter="url(#soft)">${wedges}</g>
    <circle cx="50" cy="50" r="40" fill="url(#core)"/>
    <circle cx="50" cy="50" r="40" fill="url(#rim)"/>
    <ellipse cx="42" cy="28" rx="24" ry="12" fill="url(#gloss)" transform="rotate(-18 42 28)"/>
  </g>
  <circle cx="50" cy="50" r="39" fill="none" stroke="#fff" stroke-width="2" opacity="0.8"/>
  <circle cx="66" cy="30" r="4" fill="#fff"/>
  <circle cx="34" cy="68" r="2.5" fill="#fff" opacity="0.8"/>
</svg>`;
}

function polygonPoints(cx: number, cy: number, sides: number, r: number, rotation: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = rotation + (i * 2 * Math.PI) / sides;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

function starPoints(cx: number, cy: number, points: number, outer: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

async function rasterize(svg: string, px: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  canvas.getContext('2d')!.drawImage(img, 0, 0, px, px);
  return canvas;
}

const VARIANTS: readonly Variant[] = ['none', 'lineH', 'lineV', 'burst'];

const key = (color: number | null, special: Special): string => (special === 'prism' ? 'prism' : `${color}:${special}`);

/** Piece textures for every color and special at a given device-pixel size. */
export class PieceTextures {
  private constructor(
    readonly sizePx: number,
    private readonly textures: ReadonlyMap<string, Texture>,
  ) {}

  static async create(sizePx: number): Promise<PieceTextures> {
    const px = Math.max(16, Math.round(sizePx));
    const jobs: Promise<[string, HTMLCanvasElement]>[] = [rasterize(prismSvg(), px).then((c) => ['prism', c])];
    PIECE_COLORS.forEach((_, color) => {
      for (const v of VARIANTS) jobs.push(rasterize(pieceSvg(color, v), px).then((c) => [key(color, v), c]));
    });
    const entries = await Promise.all(jobs);
    return new PieceTextures(px, new Map(entries.map(([k, c]) => [k, Texture.from(c)])));
  }

  get(piece: Pick<Piece, 'color' | 'special'>): Texture {
    return this.textures.get(key(piece.color, piece.special)) ?? Texture.WHITE;
  }

  destroy(): void {
    for (const t of this.textures.values()) t.destroy(true);
  }
}
