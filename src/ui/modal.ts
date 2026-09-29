import { clear, h } from './dom';

export interface ModalOptions {
  /** Called when the player presses Escape or taps the backdrop; omit for modals that must be answered. */
  onDismiss?: () => void;
  /** Extra class on the card for per-dialog styling. */
  variant?: string;
  label: string;
}

/**
 * One popup at a time over the game. Keeps keyboard focus inside the card while open and returns it
 * afterwards.
 */
export class Modal {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private dismiss: (() => void) | undefined;
  private returnFocus: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.card = h('div', { class: 'modal__card' });
    this.root = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, this.card);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.dismiss?.();
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains('modal--open');
  }

  open(content: Node[], opts: ModalOptions): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    clear(this.card);
    this.card.className = `modal__card${opts.variant ? ` modal__card--${opts.variant}` : ''}`;
    this.card.append(...content);
    this.root.setAttribute('aria-label', opts.label);
    this.dismiss = opts.onDismiss;
    this.root.classList.add('modal--open');
    requestAnimationFrame(() => this.focusables()[0]?.focus({ preventScroll: true }));
  }

  close(): void {
    this.root.classList.remove('modal--open');
    this.dismiss = undefined;
    this.returnFocus?.focus({ preventScroll: true });
  }

  private focusables(): HTMLElement[] {
    return [...this.card.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input')];
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.dismiss) {
      e.preventDefault();
      this.dismiss();
    } else if (e.key === 'Tab') {
      const items = this.focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}
