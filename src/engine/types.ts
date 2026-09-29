/** A cell coordinate. Row 0 is the top of the board. */
export interface Pos {
  readonly row: number;
  readonly col: number;
}

/** Piece color index, 0..5. Names live in COLOR_NAMES. */
export type Color = number;

/** The six sweets of the candy garden, in color-index order. */
export const COLOR_NAMES = ['berry', 'citrus', 'lemon', 'mint', 'bluebell', 'plum'] as const;
export const MAX_COLORS = COLOR_NAMES.length;

/** Single-letter codes used by Board.parse/dump in tests and debug output. */
export const COLOR_CODES = ['R', 'O', 'Y', 'G', 'B', 'P'] as const;

/** A piece on the board. `id` is unique for the whole game so the renderer can track it. */
export interface Piece {
  readonly id: number;
  readonly color: Color;
}

export interface Move {
  readonly a: Pos;
  readonly b: Pos;
}

export const pos = (row: number, col: number): Pos => ({ row, col });

export const samePos = (a: Pos, b: Pos): boolean => a.row === b.row && a.col === b.col;

export const isAdjacent = (a: Pos, b: Pos): boolean =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

export const posKey = (p: Pos): string => `${p.row},${p.col}`;
