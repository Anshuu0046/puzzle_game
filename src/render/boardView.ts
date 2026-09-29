import { gsap } from 'gsap';
import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { type Board, type BoardEvent, type Move, type Piece, type Pos, posKey } from '../engine';
import { FxLayer } from './fx';
import { MOTION } from './motion';
import { Particles } from './particles';
import type { PieceTextures } from './pieceArt';
import { BOARD, PIECE_COLORS } from './theme';
import { cascadeWord, comboWord } from './words';

type EventOf<T extends BoardEvent['type']> = Extract<BoardEvent, { type: T }>;

const wait = (seconds: number) => new Promise<void>((resolve) => gsap.delayedCall(seconds, resolve));

/** Blast tint for a piece: its own color, or white for the colorless Prism Orb. */
function tint(piece: Piece): number {
  return piece.color === null ? 0xffffff : parseInt(PIECE_COLORS[piece.color]!.base.slice(1), 16);
}

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
  /** Already playing its clear animation (hit by a blast before the step's 'cleared' event). */
  popped?: boolean;
  /** Sprite scale that fits the cell; idle wobble oscillates around it. */
  baseScale: number;
  /** Wobble phase so pieces don't breathe in lockstep. */
  phase: number;
}

/** Screen shake strength (fraction of a cell) and duration (s) per effect. */
const SHAKE: Partial<Record<string, [number, number]>> = {
  burst: [0.1, 0.25],
  cross: [0.06, 0.2],
  tripleCross: [0.16, 0.35],
  megaBurst: [0.22, 0.45],
  prismLines: [0.14, 0.4],
  prismBursts: [0.2, 0.45],
  boardWipe: [0.28, 0.6],
};

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
  /** Everything visual lives here so screen shake can offset it without moving the hit area. */
  private readonly content = new Container();
  private readonly particles = new Particles();
  private readonly textLayer = new Container();
  private word: Text | null = null;
  private lastClearCenter = { x: 0, y: 0 };
  private time = 0;
  private shakeLeft = 0;
  private shakeDuration = 1;
  private shakeAmp = 0;
  /** Reduced motion: no shake or wobble, fewer particles. */
  private reduced = false;
  private readonly panel = new Graphics();
  private readonly tiles = new Graphics();
  private readonly jellyLayer = new Graphics();
  /** Jelly layers per cell as last reported by the engine. */
  private jelly: number[] = [];
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
  /** Bumped by setBoard: animations queued for an older board are abandoned, never replayed. */
  private generation = 0;
  private snapPending = false;

  private readonly fx = new FxLayer();
  private hintNodes: PieceNode[] = [];
  /** Delay between chained activations in the current run (see playAll). */
  private chainGap: number = MOTION.chainStep;

  onScore: (total: number) => void = () => {};
  /** Called as each event starts playing (sound, HUD, combo text). */
  onEvent: (e: BoardEvent) => void = () => {};

  constructor(private textures: PieceTextures) {
    this.pieceLayer.mask = this.pieceMask;
    this.content.addChild(
      this.panel,
      this.tiles,
      this.jellyLayer,
      this.selectionRing,
      this.pieceLayer,
      this.pieceMask,
      this.fx.root,
      this.particles.root,
      this.textLayer,
    );
    this.root.addChild(this.content);
  }

  set reducedMotion(on: boolean) {
    this.reduced = on;
    this.particles.density = on ? 0.4 : 1;
  }

  /** Per-frame work: idle wobble, particles and shake. */
  update(dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    if (!this.reduced) {
      for (const n of this.nodes.values()) {
        const amp = n.piece.special === 'none' ? 0.018 : 0.04;
        const w = Math.sin(this.time * 2.6 + n.phase);
        n.sprite.scale.set(n.baseScale * (1 + amp * w), n.baseScale * (1 - amp * w));
      }
    }
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      const k = (this.shakeLeft / this.shakeDuration) ** 2 * this.shakeAmp;
      this.content.position.set((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k);
    } else if (this.content.x !== 0 || this.content.y !== 0) {
      this.content.position.set(0, 0);
    }
  }

  shake(strength: number, duration: number): void {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeLeft > 0 ? this.shakeAmp : 0, strength * this.cellSize);
    this.shakeDuration = Math.max(duration, this.shakeLeft);
    this.shakeLeft = this.shakeDuration;
  }

  /** Big cheer across the board (cascades, combos). Replaces any word still showing. */
  showWord(text: string): void {
    if (this.word && !this.word.destroyed) {
      gsap.killTweensOf([this.word, this.word.scale]);
      this.word.destroy();
    }
    const s = this.cellSize;
    const word = new Text({
      text,
      style: {
        fontFamily: 'Fredoka, "Baloo 2", "Trebuchet MS", sans-serif',
        fontWeight: '700',
        fontSize: Math.round(s * 0.95),
        fill: 0xffffff,
        stroke: { color: 0xff4d8a, width: Math.max(4, Math.round(s * 0.14)), join: 'round' },
        dropShadow: { color: 0x7a2458, alpha: 0.35, blur: 4, distance: Math.round(s * 0.08), angle: Math.PI / 2 },
        letterSpacing: 1,
      },
    });
    word.anchor.set(0.5);
    word.position.set((this.cols * s) / 2, (this.rows * s) / 2);
    word.scale.set(0.3);
    word.rotation = -0.06;
    this.textLayer.addChild(word);
    this.word = word;
    gsap
      .timeline({ onComplete: () => void (word.destroyed || word.destroy()) })
      .to(word.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' })
      .to(word, { rotation: 0.03, duration: 0.35, ease: 'sine.inOut' }, 0)
      .to(word, { y: word.y - s * 0.6, alpha: 0, duration: 0.4, ease: 'power2.in' }, 0.75);
  }

  /** "+120" floating up from where pieces were cleared. */
  private scorePopup(points: number, cascade: number): void {
    const s = this.cellSize;
    const t = new Text({
      text: `+${points.toLocaleString()}`,
      style: {
        fontFamily: 'Fredoka, "Baloo 2", "Trebuchet MS", sans-serif',
        fontWeight: '700',
        fontSize: Math.round(s * (0.38 + Math.min(cascade, 5) * 0.04)),
        fill: 0xffffff,
        stroke: { color: 0x8a63ff, width: Math.max(3, Math.round(s * 0.08)), join: 'round' },
      },
    });
    t.anchor.set(0.5);
    t.position.set(this.lastClearCenter.x, this.lastClearCenter.y);
    t.scale.set(0.5);
    this.textLayer.addChild(t);
    gsap
      .timeline({ onComplete: () => void (t.destroyed || t.destroy()) })
      .to(t.scale, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' })
      .to(t, { y: t.y - s * 0.9, duration: 0.8, ease: 'power1.out' }, 0)
      .to(t, { alpha: 0, duration: 0.3, ease: 'power1.in' }, 0.55);
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
    this.generation++;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.snapPending = false;
    this.clearHint();
    this.fx.clear();
    this.particles.clear();
    for (const n of this.nodes.values()) this.destroyNode(n);
    this.nodes.clear();
    this.rows = board.rows;
    this.cols = board.cols;
    this.playable = [];
    this.grid = [];
    this.jelly = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const p = { row: r, col: c };
        this.playable.push(board.isPlayable(p));
        this.jelly.push(board.jelly(p));
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
      n.sprite.texture = textures.get(n.piece);
      this.fitSprite(n);
    }
    if (old !== textures) old.destroy();
  }

  /** Gently nudges the two pieces of a suggested move toward each other until cleared. */
  showHint(move: Move): void {
    this.clearHint();
    const a = this.nodeAt(move.a);
    const b = this.nodeAt(move.b);
    if (!a || !b) return;
    this.hintNodes = [a, b];
    const nudge = this.cellSize * 0.12;
    for (const [n, from, to] of [
      [a, move.a, move.b],
      [b, move.b, move.a],
    ] as const) {
      const home = this.cellCenter(from);
      gsap.to(n.node, {
        x: home.x + Math.sign(to.col - from.col) * nudge,
        y: home.y + Math.sign(to.row - from.row) * nudge,
        duration: 0.35,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        repeatDelay: 0.15,
      });
      gsap.to(n.node.scale, { x: 1.08, y: 1.08, duration: 0.35, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0.15 });
    }
  }

  clearHint(): void {
    for (const n of this.hintNodes) {
      if (n.node.destroyed) continue;
      gsap.killTweensOf([n.node, n.node.scale]);
      const at = this.positionOf(n.piece.id);
      if (at) this.placeNode(n, at);
      n.node.scale.set(1);
    }
    this.hintNodes = [];
  }

  private positionOf(id: number): Pos | null {
    const i = this.grid.indexOf(id);
    return i < 0 ? null : { row: Math.floor(i / this.cols), col: i % this.cols };
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
    const gen = this.generation;
    this.pending++;
    this.queue = this.queue
      .then(() => this.playAll(events, gen))
      .catch((err: unknown) => console.error('animation failed', err))
      .finally(() => {
        if (gen !== this.generation) return;
        this.pending--;
        if (this.pending === 0 && this.snapPending) this.snapAll();
      });
    return this.queue;
  }

  private async playAll(events: readonly BoardEvent[], gen: number): Promise<void> {
    this.clearHint();
    for (let i = 0; i < events.length; i++) {
      if (gen !== this.generation) return;
      const e = events[i]!;
      // Falls and spawns of one cascade step animate together.
      if (e.type === 'fell' && events[i + 1]?.type === 'spawned') {
        const next = events[++i] as EventOf<'spawned'>;
        this.onEvent(e);
        this.onEvent(next);
        await Promise.all([this.playFell(e), this.playSpawned(next)]);
        continue;
      }
      if (e.type === 'cleared') {
        // Pieces that form a new special slide into it instead of just popping.
        const merges = new Map<string, Pos>();
        for (let j = i + 1; j < events.length && events[j]!.type === 'specialCreated'; j++) {
          const created = events[j] as EventOf<'specialCreated'>;
          for (const p of created.from) merges.set(posKey(p), created.pos);
        }
        this.onEvent(e);
        await this.playCleared(e, merges);
        continue;
      }
      if (e.type === 'specialActivated') {
        // Long chains compress so a big combo or the finale never drags: ~1s of blasts at most.
        let run = 1;
        while (events[i + run]?.type === 'specialActivated') run++;
        this.chainGap = Math.min(MOTION.chainStep, MOTION.chainBudget / run);
      }
      this.onEvent(e);
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
        const word = cascadeWord(e.cascade);
        if (word) this.showWord(word);
        await Promise.all(
          cells.map((p) => {
            const n = this.nodeAt(p);
            return n ? gsap.to(n.node.scale, { x: 1.15, y: 1.15, duration: MOTION.matchPulse, ease: 'power2.out', yoyo: true, repeat: 1 }) : null;
          }),
        );
        return;
      }
      case 'cleared':
        await this.playCleared(e, new Map());
        return;
      case 'specialActivated':
        await this.playActivated(e);
        return;
      case 'transformed': {
        const n = this.nodes.get(e.piece.id);
        if (!n) return;
        n.piece = e.piece;
        n.sprite.texture = this.textures.get(e.piece);
        gsap.fromTo(n.node.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
        await wait(0.04);
        return;
      }
      case 'specialCreated': {
        const n = this.createNode(e.piece);
        this.placeNode(n, e.pos);
        this.setGrid(e.pos, e.piece.id);
        n.node.scale.set(0);
        const { x, y } = this.cellCenter(e.pos);
        this.fx.ring(x, y, this.cellSize * 0.2, this.cellSize * 0.8, this.cellSize * 0.08, tint(e.piece));
        this.particles.sparkleRing(x, y, this.cellSize * 0.5, tint(e.piece));
        await gsap.to(n.node.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }).then();
        return;
      }
      case 'scored':
        this.onScore(e.total);
        if (e.points > 0) this.scorePopup(e.points, e.cascade);
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
      case 'jellyCleared':
        for (const c of e.cells) {
          this.jelly[c.pos.row * this.cols + c.pos.col] = c.layers;
          const { x, y } = this.cellCenter(c.pos);
          this.particles.pop(x, y, 0xff8fbd, this.cellSize, 0.6);
        }
        this.drawJelly();
        return;
      case 'finale':
        this.showWord('Bloom Bonus!');
        await wait(0.7);
        return;
      case 'bonusMove': {
        const n = this.nodes.get(e.piece.id);
        if (!n) return;
        n.piece = e.piece;
        n.sprite.texture = this.textures.get(e.piece);
        this.fitSprite(n);
        const { x, y } = this.cellCenter(e.pos);
        this.particles.sparkleRing(x, y, this.cellSize * 0.4, tint(e.piece));
        gsap.fromTo(n.node.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
        await wait(0.09);
        return;
      }
      case 'goals':
        return;
    }
  }

  private playCleared(e: EventOf<'cleared'>, merges: ReadonlyMap<string, Pos>): Promise<unknown> {
    if (e.pieces.length > 0) {
      const centers = e.pieces.map(({ pos }) => this.cellCenter(pos));
      this.lastClearCenter = {
        x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
        y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
      };
    }
    return Promise.all(
      e.pieces.map(({ pos, piece }) => {
        const n = this.nodes.get(piece.id);
        this.setGrid(pos, null);
        if (!n) return null;
        this.nodes.delete(piece.id);
        const target = merges.get(posKey(pos));
        if (target && !n.popped) {
          const { x, y } = this.cellCenter(target);
          return gsap
            .timeline()
            .to(n.node, { x, y, duration: MOTION.merge, ease: 'power2.in' }, 0)
            .to(n.node.scale, { x: 0.5, y: 0.5, duration: MOTION.merge, ease: 'power2.in' }, 0)
            .to(n.node, { alpha: 0, duration: 0.06 }, MOTION.merge - 0.04)
            .then(() => this.destroyNode(n));
        }
        if (n.popped) return wait(MOTION.clear).then(() => this.destroyNode(n));
        return this.popNode(n).then(() => this.destroyNode(n));
      }),
    );
  }

  /** Blast visuals; chained activations follow each other quickly. */
  private async playActivated(e: EventOf<'specialActivated'>): Promise<void> {
    const s = this.cellSize;
    const { x, y } = this.cellCenter(e.pos);
    const color = tint(e.piece);
    const n = this.nodeAt(e.pos);
    if (n && !n.popped) gsap.to(n.node.scale, { x: 1.3, y: 1.3, duration: 0.1, ease: 'power2.out', yoyo: true, repeat: 1 });
    const width = this.cols * s;
    const height = this.rows * s;
    const rowBeam = (row: number) => this.fx.beam(width / 2, (row + 0.5) * s, true, width, s * 0.6, color);
    const colBeam = (col: number) => this.fx.beam((col + 0.5) * s, height / 2, false, height, s * 0.6, color);
    const targets = () => e.cells.map((p) => this.cellCenter(p));
    const shake = SHAKE[e.effect];
    if (shake) this.shake(shake[0], shake[1]);
    const word = comboWord(e.effect);
    if (word) this.showWord(word);
    switch (e.effect) {
      case 'row':
        rowBeam(e.pos.row);
        break;
      case 'column':
        colBeam(e.pos.col);
        break;
      case 'cross':
        rowBeam(e.pos.row);
        colBeam(e.pos.col);
        break;
      case 'tripleCross':
        for (let d = -1; d <= 1; d++) {
          if (e.pos.row + d >= 0 && e.pos.row + d < this.rows) rowBeam(e.pos.row + d);
          if (e.pos.col + d >= 0 && e.pos.col + d < this.cols) colBeam(e.pos.col + d);
        }
        break;
      case 'burst':
        this.fx.ring(x, y, s * 0.3, s * 1.7, s * 0.25, color);
        break;
      case 'megaBurst':
        this.fx.ring(x, y, s * 0.5, s * 2.9, s * 0.35, color);
        this.fx.ring(x, y, s * 0.2, s * 1.8, s * 0.2, 0xffffff);
        break;
      case 'colorClear':
      case 'prismLines':
      case 'prismBursts':
        this.fx.rays(x, y, targets(), 0xffd6ec);
        this.fx.ring(x, y, s * 0.3, s * 1.4, s * 0.15, 0xffffff);
        break;
      case 'boardWipe':
        this.fx.rays(x, y, targets(), 0xffd6ec);
        this.fx.flash(-s * 0.2, -s * 0.2, width + s * 0.4, height + s * 0.4, s * 0.3);
        break;
    }
    // Pieces pop as the blast reaches them (converted pieces must survive to fire themselves).
    if (e.effect !== 'prismLines' && e.effect !== 'prismBursts') {
      const gen = this.generation;
      gsap.delayedCall(0.06, () => {
        if (gen !== this.generation) return;
        for (const p of e.cells) {
          const hit = this.nodeAt(p);
          if (hit && !hit.popped) this.popNode(hit);
        }
      });
    }
    await wait(e.effect === 'prismLines' || e.effect === 'prismBursts' ? 0.3 : this.chainGap);
  }

  /** Clear animation. The node stays registered until the engine's 'cleared' event removes it. */
  private popNode(n: PieceNode): Promise<unknown> {
    n.popped = true;
    gsap.killTweensOf([n.node, n.node.scale]);
    this.particles.pop(n.node.x, n.node.y, tint(n.piece), this.cellSize, n.piece.special === 'none' ? 1 : 1.5);
    return gsap
      .timeline()
      .to(n.node.scale, { x: 0, y: 0, duration: MOTION.clear, ease: MOTION.clearEase }, 0)
      .to(n.node, { alpha: 0, rotation: 0.4, duration: MOTION.clear, ease: 'power1.in' }, 0)
      .then();
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
        if (n.piece.color !== m.piece.color || n.piece.special !== m.piece.special) n.sprite.texture = this.textures.get(m.piece);
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
      // Jelly stretch along the direction of travel, settling with a little overshoot.
      const horizontal = a.row === b.row;
      gsap
        .timeline({ overwrite: true })
        .to(n.node.scale, { x: horizontal ? 1.14 : 0.9, y: horizontal ? 0.9 : 1.14, duration: duration / 2, ease: 'power2.out' })
        .to(n.node.scale, { x: 1, y: 1, duration: duration * 1.2, ease: 'back.out(3)' });
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
    const sprite = new Sprite(this.textures.get(piece));
    sprite.anchor.set(0.5);
    const node = new Container();
    node.addChild(sprite);
    this.pieceLayer.addChild(node);
    const n: PieceNode = { piece, node, sprite, baseScale: 1, phase: Math.random() * Math.PI * 2 };
    this.fitSprite(n);
    this.nodes.set(piece.id, n);
    return n;
  }

  private fitSprite(n: PieceNode): void {
    const size = this.cellSize * PIECE_FILL;
    n.baseScale = size / n.sprite.texture.width;
    n.sprite.scale.set(n.baseScale);
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
    this.drawJelly();
    // Pieces entering from above stay hidden until they reach the board.
    this.pieceMask.rect(-pad, 0, this.cols * s + pad * 2, this.rows * s + pad).fill(0xffffff);
  }

  /** Strawberry jelly under pieces: one layer is translucent, two layers are deeper and rimmed. */
  private drawJelly(): void {
    const s = this.cellSize;
    const g = this.jellyLayer;
    g.clear();
    const inset = Math.max(1, Math.round(s * 0.05));
    const r = Math.round(s * 0.22);
    this.jelly.forEach((layers, i) => {
      if (layers <= 0) return;
      const x = (i % this.cols) * s + inset;
      const y = Math.floor(i / this.cols) * s + inset;
      const w = s - inset * 2;
      const deep = layers >= 2;
      g.roundRect(x, y, w, w, r)
        .fill({ color: deep ? 0xe8337a : 0xff5c9a, alpha: deep ? 0.78 : 0.5 })
        .stroke({ color: deep ? 0xb81d5c : 0xe8468a, width: Math.max(2, s * (deep ? 0.07 : 0.045)), alpha: 0.85 });
      g.roundRect(x + w * 0.1, y + w * 0.08, w * 0.8, w * 0.16, w * 0.08).fill({ color: 0xffffff, alpha: 0.45 });
    });
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
