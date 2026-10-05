/**
 * Unified input: keyboard + mouse (pointer lock) and the touch controls write into the same
 * action state, so gameplay code never cares where input came from.
 */
export type Action = 'interact' | 'flashlight' | 'inventory' | 'phone' | 'pause' | 'jump' | 'crouch' | 'sprint' | 'breath' | 'back';

export class Input {
  /** x = strafe (right +), y = forward (+). Length ≤ 1. */
  readonly move = { x: 0, y: 0 };
  /** Look delta accumulated since the last frame, in pixels. */
  readonly look = { x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private readonly pressedSet = new Set<Action>();
  private readonly held = new Set<Action>();
  /** Touch joystick vector (set by the mobile controls). */
  readonly stick = { x: 0, y: 0 };
  crouchToggled = false;
  sprintToggled = false;
  /** Gameplay input is ignored while menus are open. */
  enabled = false;
  pointerLocked = false;
  usingTouch = false;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.enabled) return;
      // Ignore the occasional huge spike browsers emit on lock.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.usingTouch) return;
      if (!this.enabled) return;
      if (!this.pointerLocked) {
        this.lock();
        return;
      }
      if (e.button === 0) this.press('interact');
      if (e.button === 2) this.press('flashlight');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('touchstart', () => (this.usingTouch = true), { passive: true });
  }

  lock(): void {
    if (this.usingTouch) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* not allowed yet */
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.code;
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (e.target instanceof HTMLInputElement) return;
    const map: Record<string, Action> = {
      KeyE: 'interact',
      KeyF: 'flashlight',
      Tab: 'inventory',
      KeyI: 'inventory',
      KeyQ: 'phone',
      Escape: 'pause',
      KeyP: 'pause',
      Space: 'jump',
      KeyC: 'crouch',
      ControlLeft: 'crouch',
    };
    const a = map[k];
    if (k === 'Tab') e.preventDefault();
    if (down && !e.repeat) {
      if (a) this.press(a);
      if (k === 'Escape' || k === 'Backspace') this.press('back');
    }
    if (k === 'ShiftLeft' || k === 'ShiftRight') this.setHeld('sprint', down);
    if (k === 'Space' || k === 'KeyH') this.setHeld('breath', down);
  }

  press(a: Action): void {
    this.pressedSet.add(a);
    if (a === 'crouch') this.crouchToggled = !this.crouchToggled;
  }

  setHeld(a: Action, on: boolean): void {
    if (on) this.held.add(a);
    else this.held.delete(a);
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }

  /** True once per press. */
  consume(a: Action): boolean {
    if (this.pressedSet.has(a)) {
      this.pressedSet.delete(a);
      return true;
    }
    return false;
  }

  /** Called once per frame before gameplay reads input. */
  poll(): void {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.stick.x;
    y += this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
  }

  get sprinting(): boolean {
    return this.held.has('sprint') || this.sprintToggled;
  }

  endFrame(): void {
    this.look.x = 0;
    this.look.y = 0;
    // Presses not consumed this frame are dropped so they don't fire later unexpectedly.
    this.pressedSet.clear();
  }
}
