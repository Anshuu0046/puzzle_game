/** Render-side palette. Mirrors the CSS tokens in src/ui/tokens.css. */

export interface PieceColors {
  readonly base: string;
  readonly light: string;
  readonly dark: string;
}

/** Indexed by engine color: berry, citrus, lemon, mint, bluebell, plum. */
export const PIECE_COLORS: readonly PieceColors[] = [
  { base: '#FF4D7E', light: '#FFC2D3', dark: '#C2185B' },
  { base: '#FF9533', light: '#FFD9B0', dark: '#D2610F' },
  { base: '#FFD43B', light: '#FFF6C4', dark: '#D29A00' },
  { base: '#34D399', light: '#C4F7E0', dark: '#0F8F63' },
  { base: '#4AA8FF', light: '#CDE6FF', dark: '#1E66C8' },
  { base: '#A66BFF', light: '#E4D4FF', dark: '#6A32C4' },
];

export const BOARD = {
  panel: 0xfff3f8,
  panelLip: 0xf4c9dc,
  tileA: 0xffffff,
  tileB: 0xf3ebfb,
  tileAlpha: 0.85,
  selection: 0xffffff,
} as const;
