/** End-of-level card. */
export class EndOverlay {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    parent.appendChild(this.el);
  }

  show(won: boolean, score: number, onReplay: () => void): void {
    this.el.innerHTML = `
      <div class="overlay__card">
        <h2 class="overlay__title">${won ? 'Garden in Bloom!' : 'Out of Moves'}</h2>
        <p class="overlay__text">${won ? 'You scored' : 'So close! You scored'} ${score.toLocaleString()}</p>
        <button class="button" type="button">${won ? 'Play Again' : 'Try Again'}</button>
      </div>`;
    const button = this.el.querySelector('button')!;
    button.addEventListener('click', () => {
      this.hide();
      onReplay();
    });
    requestAnimationFrame(() => this.el.classList.add('overlay--visible'));
    button.focus({ preventScroll: true });
  }

  hide(): void {
    this.el.classList.remove('overlay--visible');
  }
}
