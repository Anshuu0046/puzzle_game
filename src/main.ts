import './ui/style.css';
import { Application } from 'pixi.js';
import { LEVELS } from './data/levels';
import { Board, Game, type Pos } from './engine';
import { BoardInput } from './render/boardInput';
import { BoardView } from './render/boardView';
import { PieceTextures } from './render/pieceArt';
import { Hud } from './ui/hud';
import { EndOverlay } from './ui/overlay';

/** Screen margins around the board, on the 8px grid. */
const SIDE_MARGIN = 16;
const HUD_GAP = 16;
const BOTTOM_MARGIN = 24;
/** Idle time before the board suggests a move. */
const HINT_DELAY_MS = 5000;

declare global {
  interface Window {
    /** Dev-only hooks used by the Playwright screenshot script. */
    __sugarBloom?: {
      readonly game: Game;
      cellToClient(p: Pos): { x: number; y: number };
      isIdle(): boolean;
      /** Replaces the board with a scripted layout (see Board.parse). */
      loadBoard(text: string): void;
      showHint(): void;
    };
  }
}

function newSeed(): number {
  const fromUrl = new URLSearchParams(location.search).get('seed');
  return fromUrl !== null && fromUrl !== '' ? Number(fromUrl) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
}

async function boot(): Promise<void> {
  const level = LEVELS[0]!;
  let game = Game.start(level, newSeed());

  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    preference: 'webgl',
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  const hud = new Hud(document.getElementById('hud')!);
  const overlay = new EndOverlay(document.body);
  let textures = await PieceTextures.create(64);
  const view = new BoardView(textures);
  app.stage.addChild(view.root);

  const showLevel = () => {
    view.setBoard(game.board);
    hud.setLevel(level.name, level.targetScore);
    hud.setMoves(game.movesLeft);
    hud.setScore(game.score, false);
  };
  view.onScore = (total) => hud.setScore(total);
  showLevel();

  // Layout: the board takes whatever space the HUD leaves, and piece art is re-rasterized at the
  // exact device-pixel size so it stays crisp on every screen.
  let textureRequest = 0;
  const relayout = async () => {
    const top = hud.el.getBoundingClientRect().bottom + HUD_GAP;
    view.layout({
      x: SIDE_MARGIN,
      y: top,
      width: window.innerWidth - SIDE_MARGIN * 2,
      height: window.innerHeight - top - BOTTOM_MARGIN,
    });
    const px = Math.round(view.pieceSizePx * app.renderer.resolution);
    if (Math.abs(px - textures.sizePx) / textures.sizePx < 0.05) return;
    const request = ++textureRequest;
    const next = await PieceTextures.create(px);
    if (request !== textureRequest) {
      next.destroy();
      return;
    }
    textures = next;
    view.setTextures(next);
  };
  let frame = 0;
  const scheduleLayout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => void relayout());
  };
  window.addEventListener('resize', scheduleLayout);
  void document.fonts.ready.then(scheduleLayout);
  await relayout();

  let hintTimer = 0;
  const scheduleHint = () => {
    window.clearTimeout(hintTimer);
    view.clearHint();
    hintTimer = window.setTimeout(() => {
      if (view.busy || game.status !== 'playing') return;
      const move = game.hint();
      if (move) view.showHint(move);
    }, HINT_DELAY_MS);
  };
  // Capture phase: runs before the board's own handlers, so a new selection isn't undone.
  window.addEventListener('pointerdown', scheduleHint, { capture: true });
  window.addEventListener('keydown', scheduleHint, { capture: true });

  const restart = () => {
    game = Game.start(level, newSeed());
    showLevel();
    scheduleHint();
  };

  const onSwap = (a: Pos, b: Pos) => {
    if (view.busy || game.status !== 'playing') return;
    const result = game.trySwap(a, b);
    if (result.events.length === 0) return;
    if (result.accepted) hud.setMoves(game.movesLeft);
    void view.play(result.events).then(() => {
      if (game.status !== 'playing') overlay.show(game.status === 'won', game.score, restart);
      else scheduleHint();
    });
  };
  scheduleHint();
  new BoardInput(view, onSwap, () => view.busy || game.status !== 'playing');

  if (import.meta.env.DEV) {
    window.__sugarBloom = {
      get game() {
        return game;
      },
      cellToClient: (p) => view.root.toGlobal(view.cellCenter(p)),
      isIdle: () => !view.busy,
      loadBoard: (text) => {
        game = Game.fromBoard(Board.parse(text), level, 1);
        showLevel();
      },
      showHint: () => {
        const move = game.hint();
        if (move) view.showHint(move);
      },
    };
  }
}

void boot();
