import { Texture } from 'pixi.js';
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

export function pieceSvg(color: number): string {
  const c: PieceColors = PIECE_COLORS[color]!;
  const shape = SHAPES[color]!;
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
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="${c.dark}" flood-opacity="0.45"/>
    </filter>
    <clipPath id="clip">${shape('#000')}</clipPath>
  </defs>
  <g filter="url(#shadow)">${shape('url(#body)')}</g>
  <g clip-path="url(#clip)">
    <ellipse cx="50" cy="86" rx="40" ry="16" fill="${c.dark}" opacity="0.25"/>
    <ellipse cx="44" cy="32" rx="24" ry="13" fill="url(#gloss)" transform="rotate(-18 44 32)"/>
  </g>
  <circle cx="68" cy="30" r="4" fill="#fff" opacity="0.85"/>
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

/** Piece textures for every color at a given device-pixel size. */
export class PieceTextures {
  private constructor(
    readonly sizePx: number,
    private readonly textures: readonly Texture[],
  ) {}

  static async create(sizePx: number): Promise<PieceTextures> {
    const px = Math.max(16, Math.round(sizePx));
    const canvases = await Promise.all(PIECE_COLORS.map((_, i) => rasterize(pieceSvg(i), px)));
    return new PieceTextures(px, canvases.map((c) => Texture.from(c)));
  }

  get(color: number): Texture {
    return this.textures[color] ?? Texture.WHITE;
  }

  destroy(): void {
    for (const t of this.textures) t.destroy(true);
  }
}
