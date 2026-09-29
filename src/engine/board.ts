import { COLOR_CODES, type Piece, type Pos, type Special, pos } from './types';

const SPECIAL_SUFFIX: Record<Exclude<Special, 'none' | 'prism'>, string> = { lineH: '-', lineV: '|', burst: '*' };

/**
 * Mutable grid of pieces. Cells outside the level shape are holes: they never hold a piece, they
 * break match lines, and gravity lets pieces fall past them.
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  private readonly playable: readonly boolean[];
  private readonly cells: (Piece | null)[];
  /** Jelly layers under each cell (0 = none). Clearing a piece on jelly removes one layer. */
  private readonly jellyLayers: number[];
  /** Playable positions in row-major order from the top-left. */
  readonly positions: readonly Pos[];
  private readonly columnCells: readonly (readonly Pos[])[];

  constructor(rows: number, cols: number, playable?: readonly boolean[]) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      throw new RangeError(`invalid board size ${rows}x${cols}`);
    }
    if (playable && playable.length !== rows * cols) throw new RangeError('shape mask size mismatch');
    this.rows = rows;
    this.cols = cols;
    this.playable = playable ? [...playable] : new Array<boolean>(rows * cols).fill(true);
    this.cells = new Array<Piece | null>(rows * cols).fill(null);
    this.jellyLayers = new Array<number>(rows * cols).fill(0);
    const all: Pos[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (this.playable[r * cols + c]) all.push(pos(r, c));
    this.positions = all;
    this.columnCells = Array.from({ length: cols }, (_, c) => all.filter((p) => p.col === c));
  }

  /** Builds an empty board from a shape: one string per row, '#' = hole, anything else = playable. */
  static fromShape(shape: readonly string[]): Board {
    const rows = shape.length;
    const cols = shape[0]?.length ?? 0;
    if (shape.some((line) => line.length !== cols)) throw new RangeError('shape rows must all be the same length');
    const mask: boolean[] = [];
    for (const line of shape) for (const ch of line) mask.push(ch !== '#');
    return new Board(rows, cols, mask);
  }

  inBounds(p: Pos): boolean {
    return p.row >= 0 && p.row < this.rows && p.col >= 0 && p.col < this.cols;
  }

  isPlayable(p: Pos): boolean {
    return this.inBounds(p) && this.playable[p.row * this.cols + p.col] === true;
  }

  /** The piece at p; null for empty cells, holes and out-of-bounds positions. */
  get(p: Pos): Piece | null {
    return this.inBounds(p) ? (this.cells[p.row * this.cols + p.col] ?? null) : null;
  }

  set(p: Pos, piece: Piece | null): void {
    if (!this.isPlayable(p)) {
      if (piece === null && this.inBounds(p)) return;
      throw new RangeError(`cannot place a piece at non-playable cell ${p.row},${p.col}`);
    }
    this.cells[p.row * this.cols + p.col] = piece;
  }

  jelly(p: Pos): number {
    return this.inBounds(p) ? (this.jellyLayers[p.row * this.cols + p.col] ?? 0) : 0;
  }

  setJelly(p: Pos, layers: number): void {
    if (!this.isPlayable(p)) throw new RangeError(`cannot put jelly on non-playable cell ${p.row},${p.col}`);
    this.jellyLayers[p.row * this.cols + p.col] = Math.max(0, Math.floor(layers));
  }

  /** Total jelly layers left on the board. */
  jellyTotal(): number {
    return this.jellyLayers.reduce((sum, n) => sum + n, 0);
  }

  /**
   * Applies a jelly map: one string per row, digits = layers ('1', '2'), anything else = none.
   */
  applyJelly(rows: readonly string[]): void {
    if (rows.length !== this.rows || rows.some((r) => r.length !== this.cols)) throw new RangeError('jelly map must match the board size');
    rows.forEach((line, r) =>
      [...line].forEach((ch, c) => {
        const n = ch >= '1' && ch <= '9' ? Number(ch) : 0;
        if (n > 0) this.setJelly(pos(r, c), n);
      }),
    );
  }

  swap(a: Pos, b: Pos): void {
    const tmp = this.get(a);
    this.set(a, this.get(b));
    this.set(b, tmp);
  }

  /** Playable cells of one column, top to bottom. */
  column(col: number): readonly Pos[] {
    return this.columnCells[col] ?? [];
  }

  pieces(): { pos: Pos; piece: Piece }[] {
    const out: { pos: Pos; piece: Piece }[] = [];
    for (const p of this.positions) {
      const piece = this.get(p);
      if (piece) out.push({ pos: p, piece });
    }
    return out;
  }

  isFull(): boolean {
    return this.positions.every((p) => this.get(p) !== null);
  }

  clone(): Board {
    const b = new Board(this.rows, this.cols, this.playable);
    for (let i = 0; i < this.cells.length; i++) {
      b.cells[i] = this.cells[i] ?? null;
      b.jellyLayers[i] = this.jellyLayers[i] ?? 0;
    }
    return b;
  }

  /** Compact text form, see parse(). Ids are not included. */
  dump(): string {
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < this.cols; c++) {
        const p = pos(r, c);
        const piece = this.get(p);
        row.push(!this.isPlayable(p) ? '#' : piece ? pieceToken(piece) : '.');
      }
      lines.push(row.join(' '));
    }
    return lines.join('\n');
  }

  /**
   * Parses a board from whitespace-separated tokens, one line per row:
   * `R O Y G B P` = pieces of colors 0..5, `.` = empty playable cell, `#` = hole.
   * Specials: suffix `-` Line Blaster (row), `|` Line Blaster (column), `*` Burst Bomb; `@` Prism Orb.
   * Pieces get ids firstId, firstId+1, ... in row-major order.
   */
  static parse(text: string, firstId = 1): Board {
    const grid = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.split(/\s+/));
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (grid.some((r) => r.length !== cols)) throw new RangeError('all rows must have the same number of cells');
    const board = new Board(
      rows,
      cols,
      grid.flat().map((t) => t !== '#'),
    );
    let id = firstId;
    grid.forEach((line, r) =>
      line.forEach((token, c) => {
        if (token === '#' || token === '.') return;
        board.set(pos(r, c), parseToken(token, id++));
      }),
    );
    return board;
  }
}

function pieceToken(piece: Piece): string {
  if (piece.special === 'prism') return '@';
  const code = COLOR_CODES[piece.color ?? -1] ?? '?';
  return piece.special === 'none' ? code : code + SPECIAL_SUFFIX[piece.special];
}

function parseToken(token: string, id: number): Piece {
  if (token === '@') return { id, color: null, special: 'prism' };
  const color = (COLOR_CODES as readonly string[]).indexOf(token[0] ?? '');
  const suffix = token.slice(1);
  const special = suffix === '' ? 'none' : (Object.entries(SPECIAL_SUFFIX).find(([, v]) => v === suffix)?.[0] as Special | undefined);
  if (color < 0 || special === undefined) throw new RangeError(`unknown token '${token}'`);
  return { id, color, special };
}
