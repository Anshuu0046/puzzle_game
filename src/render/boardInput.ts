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
    // A tap: select, deselect, or swap with the previously selected neighbor.
    const selected = this.view.selection;
    const cell = d.cell;
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
