import { Application } from 'pixi.js';
import { BoardView, type Rect } from './boardView';
import { PieceTextures } from './pieceArt';

/**
 * The Pixi canvas that hosts the board. Owns device-pixel handling: piece art is re-rasterized at
 * the exact size it is drawn so it stays crisp on every screen.
 */
export class BoardStage {
  private textureRequest = 0;
  /** Called if the browser drops the WebGL context (GPU reset, too many tabs). */
  onContextLost: () => void = () => {};

  private constructor(
    readonly app: Application,
    readonly view: BoardView,
    private readonly host: HTMLElement,
    private textures: PieceTextures,
  ) {}

  static async create(host: HTMLElement): Promise<BoardStage> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      preference: 'webgl',
    });
    host.appendChild(app.canvas);
    app.canvas.setAttribute('aria-label', 'Game board');
    const textures = await PieceTextures.create(64);
    const view = new BoardView(textures);
    app.stage.addChild(view.root);
    app.ticker.add((t) => view.update(Math.min(0.05, t.deltaMS / 1000)));
    const stage = new BoardStage(app, view, host, textures);
    app.canvas.addEventListener('webglcontextlost', () => stage.onContextLost());
    return stage;
  }

  /** Shows the canvas and runs the render loop only while a level is on screen. */
  setVisible(visible: boolean): void {
    this.host.hidden = !visible;
    this.setRunning(visible);
  }

  setRunning(running: boolean): void {
    if (running) this.app.ticker.start();
    else this.app.ticker.stop();
  }

  async layout(area: Rect): Promise<void> {
    this.view.layout(area);
    const px = Math.round(this.view.pieceSizePx * this.app.renderer.resolution);
    if (Math.abs(px - this.textures.sizePx) / this.textures.sizePx < 0.05) return;
    const request = ++this.textureRequest;
    const next = await PieceTextures.create(px);
    if (request !== this.textureRequest) {
      next.destroy();
      return;
    }
    this.textures = next;
    this.view.setTextures(next);
  }
}
