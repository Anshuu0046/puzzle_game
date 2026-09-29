import { gsap } from 'gsap';
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Board, BoardEvent, Piece, Pos } from '../engine';
import { MOTION } from './motion';
import type { PieceTextures } from './pieceArt';
import { BOARD } from './theme';

/** Fraction of a cell a piece occupies. */
const PIECE_FILL = 0.9;
/** Extra panel margin around the tiles, as a fraction of a cell. */
const PANEL_PAD = 0.18;
/** Where the board sits in spare vertical space: 0 = top, 0.5 = centered. */
const VERTICAL_BIAS = 0.35;

interface PieceNode {
  piece: Piece;
  /** Holds scale/rotation tweens; the sprite inside keeps the texture fit. */
  node: Container;
  sprite: Sprite;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the board and plays engine events as a queued animation timeline. It only mirrors what the
 * engine reports; it never decides anything about the rules.
 */
export class BoardView {
  readonly root = new Container();
  private readonly panel = new Graphics();
  private readonly tiles = new Graphics();
  private readonly selectionRing = new Graphics();
  private readonly pieceLayer = new Container();
  private readonly pieceMask = new Graphics();

  private rows = 0;
  private cols = 0;
  private playable: boolean[] = [];
  /** View-side grid of piece ids, kept in step with the events played so far. */
  private grid: (number | null)[] = [];
  private readonly nodes = new Map<number, PieceNode>();
  private cellSize = 48;
  private selected: Pos | null = null;

  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private snapPending = false;

  onScore: (total: number) => void = () => {};

  constructor(private textures: PieceTextures) {
    this.pieceLayer.mask = this.pieceMask;
    this.root.addChild(this.panel, this.tiles, this.selectionRing, this.pieceLayer, this.pieceMask);
  }

  get cell(): number {
    return this.cellSize;
  }

  /** True while animations are queued or playing. */
  get busy(): boolean {
    return this.pending > 0;
  }

  get pieceSizePx(): number {
    return this.cellSize * PIECE_FILL;
  }

  /** Replaces the whole view state with a board snapshot (new level, or resync). */
  setBoard(board: Board): void {
    for (const n of this.nodes.values()) this.destroyNode(n);
    this.nodes.clear();
    this.rows = board.rows;
    this.cols = board.cols;
    this.playable = [];
    this.grid = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const p = { row: r, col: c };
        this.playable.push(board.isPlayable(p));
        const piece = board.get(p);
        this.grid.push(piece?.id ?? null);
        if (piece) this.placeNode(this.createNode(piece), p);
      }
    }
    this.select(null);
    this.redrawStatic();
  }

  /** Fits the board into `area` (CSS pixels). Returns the new cell size. */
  layout(area: Rect, maxCell = 84): number {
    if (this.rows === 0) return this.cellSize;
    const padCells = PANEL_PAD * 2;
    const cell = Math.floor(Math.min(area.width / (this.cols + padCells), area.height / (this.rows + padCells), maxCell));
    this.cellSize = Math.max(16, cell);
    const w = this.cols * this.cellSize;
    const h = this.rows * this.cellSize;
    // Sit a little above center so the board reads as attached to the HUD on tall phones.
    this.root.position.set(Math.round(area.x + (area.width - w) / 2), Math.round(area.y + (area.height - h) * VERTICAL_BIAS));
    this.root.hitArea = new Rectangle(0, 0, w, h);
    this.redrawStatic();
    // Killing tweens mid-playback would leave the queue waiting forever, so snap once it drains.
    if (this.busy) this.snapPending = true;
    else this.snapAll();
    return this.cellSize;
  }

  /** Puts every piece exactly on its cell at the current size, dropping idle tweens. */
  private snapAll(): void {
    this.snapPending = false;
    for (const [i, id] of this.grid.entries()) {
      if (id === null) continue;
      const n = this.nodes.get(id);
      if (!n) continue;
      gsap.killTweensOf([n.node, n.node.scale]);
      this.fitSprite(n);
      this.placeNode(n, { row: Math.floor(i / this.cols), col: i % this.cols });
      n.node.scale.set(1);
      n.node.rotation = 0;
      n.node.alpha = 1;
    }
    const sel = this.selected;
    this.selected = null;
    this.select(sel);
  }

  setTextures(textures: PieceTextures): void {
    const old = this.textures;
    this.textures = textures;
    for (const n of this.nodes.values()) {
      n.sprite.texture = textures.get(n.piece.color);
      this.fitSprite(n);
    }
    if (old !== textures) old.destroy();
  }

  /** Board-local center of a cell. */
  cellCenter(p: Pos): { x: number; y: number } {
    return { x: (p.col + 0.5) * this.cellSize, y: (p.row + 0.5) * this.cellSize };
  }

  /** The playable cell under a board-local point, or null. */
  cellAt(x: number, y: number): Pos | null {
    const p = { row: Math.floor(y / this.cellSize), col: Math.floor(x / this.cellSize) };
    return this.isPlayable(p) ? p : null;
  }

  isPlayable(p: Pos): boolean {
    return p.row >= 0 && p.row < this.rows && p.col >= 0 && p.col < this.cols && this.playable[p.row * this.cols + p.col] === true;
  }

  select(p: Pos | null): void {
    const prev = this.selected;
    this.selected = p;
    if (prev) {
      const n = this.nodeAt(prev);
      if (n) gsap.to(n.node.scale, { x: 1, y: 1, duration: 0.15, ease: 'power2.out', overwrite: true });
    }
    if (p) {
      const n = this.nodeAt(p);
      if (n) gsap.to(n.node.scale, { x: 1.1, y: 1.1, duration: 0.18, ease: 'back.out(3)', overwrite: true });
    }
    this.drawSelection();
  }

  get selection(): Pos | null {
    return this.selected;
  }

  /** Queues events for playback. Resolves when they (and everything queued before) have played. */
  play(events: readonly BoardEvent[]): Promise<void> {
    this.pending++;
    this.queue = this.queue
      .then(() => this.playAll(events))
      .catch((err: unknown) => console.error('animation failed', err))
      .finally(() => {
        this.pending--;
        if (this.pending === 0 && this.snapPending) this.snapAll();
      });
    return this.queue;
  }

  private async playAll(events: readonly BoardEvent[]): Promise<void> {
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      // Falls and spawns of one cascade step animate together.
      if (e.type === 'fell' && events[i + 1]?.type === 'spawned') {
        const next = events[++i] as Extract<BoardEvent, { type: 'spawned' }>;
        await Promise.all([this.playFell(e), this.playSpawned(next)]);
        continue;
      }
      await this.playEvent(e);
    }
  }

  private async playEvent(e: BoardEvent): Promise<void> {
    switch (e.type) {
      case 'swapped':
        this.swapGrid(e.a, e.b);
        await this.tweenSwap(e.a, e.b, MOTION.swapEase, MOTION.swap);
        return;
      case 'swapRejected':
        this.swapGrid(e.a, e.b);
        await this.tweenSwap(e.a, e.b, MOTION.swapEase, MOTION.swap);
        this.swapGrid(e.a, e.b);
        await this.tweenSwap(e.a, e.b, MOTION.rejectEase, MOTION.rejectBack);
        return;
      case 'matched': {
        const cells = e.groups.flatMap((g) => g.cells);
        await Promise.all(
          cells.map((p) => {
            const n = this.nodeAt(p);
            return n ? gsap.to(n.node.scale, { x: 1.15, y: 1.15, duration: MOTION.matchPulse, ease: 'power2.out', yoyo: true, repeat: 1 }) : null;
          }),
        );
        return;
      }
      case 'cleared':
        await Promise.all(
          e.pieces.map(({ pos, piece }) => {
            const n = this.nodes.get(piece.id);
            this.setGrid(pos, null);
            if (!n) return null;
            this.nodes.delete(piece.id);
            return gsap
              .timeline()
              .to(n.node.scale, { x: 0, y: 0, duration: MOTION.clear, ease: MOTION.clearEase }, 0)
              .to(n.node, { alpha: 0, rotation: 0.4, duration: MOTION.clear, ease: 'power1.in' }, 0)
              .then(() => this.destroyNode(n));
          }),
        );
        return;
      case 'scored':
        this.onScore(e.total);
        return;
      case 'fell':
        await this.playFell(e);
        return;
      case 'spawned':
        await this.playSpawned(e);
        return;
      case 'shuffled':
        await this.playShuffled(e);
        return;
    }
  }

  private playFell(e: Extract<BoardEvent, { type: 'fell' }>): Promise<unknown> {
    for (const f of e.falls) this.setGrid(f.from, null);
    for (const f of e.falls) this.setGrid(f.to, f.piece.id);
    return Promise.all(
      e.falls.map((f) => {
        const n = this.nodes.get(f.piece.id);
        return n ? this.dropTo(n, f.to, f.to.row - f.from.row) : null;
      }),
    );
  }

  private playSpawned(e: Extract<BoardEvent, { type: 'spawned' }>): Promise<unknown> {
    return Promise.all(
      e.spawns.map((s) => {
        const n = this.createNode(s.piece);
        this.placeNode(n, { row: s.startRow, col: s.to.col });
        this.setGrid(s.to, s.piece.id);
        return this.dropTo(n, s.to, s.to.row - s.startRow);
      }),
    );
  }

  private playShuffled(e: Extract<BoardEvent, { type: 'shuffled' }>): Promise<unknown> {
    for (const m of e.moves) this.setGrid(m.from, null);
    for (const m of e.moves) this.setGrid(m.to, m.piece.id);
    return Promise.all(
      e.moves.map((m) => {
        const n = this.nodes.get(m.piece.id);
        if (!n) return null;
        if (n.piece.color !== m.piece.color) n.sprite.texture = this.textures.get(m.piece.color);
        n.piece = m.piece;
        const { x, y } = this.cellCenter(m.to);
        return gsap
          .timeline()
          .to(n.node.scale, { x: 0.6, y: 0.6, duration: MOTION.shuffle / 2, ease: 'power2.in' }, 0)
          .to(n.node, { x, y, duration: MOTION.shuffle, ease: MOTION.shuffleEase }, 0)
          .to(n.node.scale, { x: 1, y: 1, duration: MOTION.shuffle / 2, ease: 'back.out(2)' }, MOTION.shuffle / 2);
      }),
    );
  }

  /** Gravity-style drop: accelerates, then a quick squash on landing. */
  private dropTo(n: PieceNode, to: Pos, rows: number): Promise<unknown> {
    const { x, y } = this.cellCenter(to);
    const duration = MOTION.fallBase + MOTION.fallPerRow * Math.sqrt(Math.max(1, rows));
    return gsap
      .timeline()
      .to(n.node, { x, y, duration, ease: MOTION.fallEase })
      .to(n.node.scale, { x: 1.12, y: 0.86, duration: MOTION.landSquash, ease: 'power2.out' })
      .to(n.node.scale, { x: 1, y: 1, duration: MOTION.landSquash * 2, ease: 'back.out(3)' })
      .then();
  }

  private tweenSwap(a: Pos, b: Pos, ease: string, duration: number): Promise<unknown> {
    const na = this.nodeAt(a);
    const nb = this.nodeAt(b);
    const tweens: Promise<unknown>[] = [];
    for (const [n, p] of [
      [na, a],
      [nb, b],
    ] as const) {
      if (!n) continue;
      const { x, y } = this.cellCenter(p);
      tweens.push(gsap.to(n.node, { x, y, duration, ease }).then());
      gsap.to(n.node.scale, { x: 1, y: 1, duration: 0.1, overwrite: true });
    }
    return Promise.all(tweens);
  }

  private swapGrid(a: Pos, b: Pos): void {
    const ia = a.row * this.cols + a.col;
    const ib = b.row * this.cols + b.col;
    const tmp = this.grid[ia] ?? null;
    this.grid[ia] = this.grid[ib] ?? null;
    this.grid[ib] = tmp;
  }

  private setGrid(p: Pos, id: number | null): void {
    this.grid[p.row * this.cols + p.col] = id;
  }

  private nodeAt(p: Pos): PieceNode | undefined {
    const id = this.grid[p.row * this.cols + p.col];
    return id == null ? undefined : this.nodes.get(id);
  }

  private createNode(piece: Piece): PieceNode {
    const sprite = new Sprite(this.textures.get(piece.color));
    sprite.anchor.set(0.5);
    const node = new Container();
    node.addChild(sprite);
    this.pieceLayer.addChild(node);
    const n: PieceNode = { piece, node, sprite };
    this.fitSprite(n);
    this.nodes.set(piece.id, n);
    return n;
  }

  private fitSprite(n: PieceNode): void {
    const size = this.cellSize * PIECE_FILL;
    n.sprite.scale.set(size / n.sprite.texture.width);
  }

  private placeNode(n: PieceNode, p: Pos): void {
    const { x, y } = this.cellCenter(p);
    n.node.position.set(x, y);
  }

  private destroyNode(n: PieceNode): void {
    gsap.killTweensOf([n.node, n.node.scale]);
    n.node.destroy({ children: true });
  }

  private redrawStatic(): void {
    const s = this.cellSize;
    const pad = Math.round(s * PANEL_PAD);
    const radius = Math.round(s * 0.28);
    this.panel.clear();
    this.tiles.clear();
    this.pieceMask.clear();
    const open = (r: number, c: number) => this.isPlayable({ row: r, col: c });
    // The tray is drawn solid (overlapping translucent shapes would stack visibly). Each padded cell
    // only rounds the corners that are on the outside of the level shape, so neighbors join seamlessly.
    const lip = Math.max(2, Math.round(s * 0.08));
    for (const [color, dy] of [
      [BOARD.panelLip, lip],
      [BOARD.panel, 0],
    ] as const) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (!open(r, c)) continue;
          const x0 = c * s - pad;
          const y0 = r * s - pad + dy;
          const x1 = (c + 1) * s + pad;
          const y1 = (r + 1) * s + pad + dy;
          const corner = (dr: number, dc: number) => (open(r + dr, c) || open(r, c + dc) ? 0 : radius);
          this.panel
            .roundShape(
              [
                { x: x0, y: y0, radius: corner(-1, -1) },
                { x: x1, y: y0, radius: corner(-1, 1) },
                { x: x1, y: y1, radius: corner(1, 1) },
                { x: x0, y: y1, radius: corner(1, -1) },
              ],
              radius,
            )
            .fill({ color });
        }
      }
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!open(r, c)) continue;
        const inset = Math.max(1, Math.round(s * 0.04));
        this.tiles
          .roundRect(c * s + inset, r * s + inset, s - inset * 2, s - inset * 2, Math.round(s * 0.2))
          .fill({ color: (r + c) % 2 === 0 ? BOARD.tileA : BOARD.tileB, alpha: BOARD.tileAlpha });
      }
    }
    // Pieces entering from above stay hidden until they reach the board.
    this.pieceMask.rect(-pad, 0, this.cols * s + pad * 2, this.rows * s + pad).fill(0xffffff);
  }

  private drawSelection(): void {
    this.selectionRing.clear();
    if (!this.selected) return;
    const s = this.cellSize;
    const inset = Math.round(s * 0.04);
    this.selectionRing
      .roundRect(this.selected.col * s + inset, this.selected.row * s + inset, s - inset * 2, s - inset * 2, Math.round(s * 0.2))
      .fill({ color: BOARD.selection, alpha: 0.9 })
      .stroke({ color: 0xff7aa8, width: Math.max(2, Math.round(s * 0.05)), alpha: 0.9 });
  }
}
