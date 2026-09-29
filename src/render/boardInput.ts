import type { FederatedPointerEvent } from 'pixi.js';
import type { Pos } from '../engine';
import type { BoardView } from './boardView';

/** How far (in cells) a drag must travel before it counts as a swap. */
const DRAG_THRESHOLD = 0.3;

/**
 * Turns pointer input on the board into swap requests: drag a piece toward a neighbor (touch or
 * mouse), or tap one piece and then an adjacent one. Legality is left to the engine.
 */
export class BoardInput {
  private drag: { cell: Pos; x: number; y: number; id: number; used: boolean } | null = null;

  constructor(
    private readonly view: BoardView,
    private readonly onSwap: (a: Pos, b: Pos) => void,
    private readonly isLocked: () => boolean,
  ) {
    const root = view.root;
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerdown', this.down, this);
    root.on('globalpointermove', this.move, this);
    root.on('pointerup', this.up, this);
    root.on('pointerupoutside', this.cancel, this);
  }

  private local(e: FederatedPointerEvent): { x: number; y: number } {
    return this.view.root.toLocal(e.global);
  }

  private down(e: FederatedPointerEvent): void {
    if (this.isLocked()) return;
    const { x, y } = this.local(e);
    const cell = this.view.cellAt(x, y);
    this.drag = cell ? { cell, x, y, id: e.pointerId, used: false } : null;
  }

  private move(e: FederatedPointerEvent): void {
    const d = this.drag;
    if (!d || d.used || e.pointerId !== d.id) return;
    const { x, y } = this.local(e);
    const dx = x - d.x;
    const dy = y - d.y;
    const threshold = this.view.cell * DRAG_THRESHOLD;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    d.used = true;
    const target =
      Math.abs(dx) > Math.abs(dy)
        ? { row: d.cell.row, col: d.cell.col + Math.sign(dx) }
        : { row: d.cell.row + Math.sign(dy), col: d.cell.col };
    this.view.select(null);
    if (this.view.isPlayable(target) && !this.isLocked()) this.onSwap(d.cell, target);
  }

  private up(e: FederatedPointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.used || e.pointerId !== d.id || this.isLocked()) return;
    this.view.setCursor(null);
    this.tap(d.cell);
  }

  /**
   * Keyboard play: arrows move a cursor over the board, Enter/Space act like a tap (select, then
   * pick a neighbor to swap). Returns true when the key was used.
   */
  handleKey(e: KeyboardEvent): boolean {
    const dirs: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const dir = dirs[e.key];
    if (!dir && e.key !== 'Enter' && e.key !== ' ') return false;
    if (this.isLocked()) return true;
    const cursor = this.view.cursor ?? this.view.selection ?? this.view.firstPlayable();
    if (!cursor) return true;
    if (!this.view.cursor) {
      this.view.setCursor(cursor);
      if (dir) return true;
    }
    if (dir) {
      // Step over holes to the next playable cell in that direction.
      let next = { row: cursor.row + dir[0], col: cursor.col + dir[1] };
      while (this.view.inBounds(next) && !this.view.isPlayable(next)) next = { row: next.row + dir[0], col: next.col + dir[1] };
      if (this.view.isPlayable(next)) this.view.setCursor(next);
      return true;
    }
    this.tap(cursor);
    return true;
  }

  /** Select, deselect, or swap with the previously selected neighbor. */
  private tap(cell: Pos): void {
    const selected = this.view.selection;
    if (selected && selected.row === cell.row && selected.col === cell.col) {
      this.view.select(null);
    } else if (selected && Math.abs(selected.row - cell.row) + Math.abs(selected.col - cell.col) === 1) {
      this.view.select(null);
      this.onSwap(selected, cell);
    } else {
      this.view.select(cell);
    }
  }

  private cancel(): void {
    this.drag = null;
  }
}
