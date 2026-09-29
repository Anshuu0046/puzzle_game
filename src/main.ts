// Self-hosted Google Fonts (latin subset only): display = Fredoka, UI = Nunito.
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './ui/style.css';
// Lets Pixi run under a strict Content Security Policy (no eval / new Function).
import 'pixi.js/unsafe-eval';
import { GameAudio } from './audio/audio';
import { LEVELS, levelById } from './data/levels';
import { SaveStore, browserStorage } from './data/save';
import { Board, Game, type Pos } from './engine';
import { BoardStage } from './render/stage';
import { App } from './ui/app';
import { mountFpsMeter } from './ui/fps';

declare global {
  interface Window {
    /** Test hooks for the Playwright walk-through (dev server, or any build opened with ?e2e). */
    __sugarBloom?: {
      readonly app: App;
      readonly game: Game | null;
      cellToClient(p: Pos): { x: number; y: number };
      isIdle(): boolean;
      /** Replaces the board with a scripted layout (see Board.parse), optionally with fewer moves. */
      loadBoard(text: string, levelId?: number, moves?: number): void;
      showHint(): void;
      audioLoaded(): { loaded: number; total: number };
    };
  }
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('offline mode unavailable', err));
  });
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  // Canvas text (combo words) needs the display font loaded before first use.
  void document.fonts?.load('700 32px Fredoka').catch(() => undefined);
  const stage = await BoardStage.create(document.getElementById('stage')!);
  const audio = new GameAudio();
  const save = new SaveStore(browserStorage(), LEVELS.length);
  const app = new App({
    stage,
    audio,
    save,
    screens: document.getElementById('screens')!,
    hudEl: document.getElementById('hud')!,
    modalRoot: document.body,
    ...(seedParam ? { seed: Number(seedParam) >>> 0 } : {}),
  });
  // Browsers only allow sound after a user gesture.
  window.addEventListener('pointerdown', () => audio.startMusic(), { once: true });
  app.start();
  if (params.has('fps')) mountFpsMeter(stage.app.ticker);
  document.body.classList.add('ready');

  if (import.meta.env.DEV || params.has('e2e')) {
    window.__sugarBloom = {
      app,
      get game() {
        return app.currentGame;
      },
      cellToClient: (p) => stage.view.root.toGlobal(stage.view.cellCenter(p)),
      isIdle: () => app.isIdle,
      loadBoard: (text, levelId = 1, moves) => {
        const level = levelById(levelId)!;
        app.loadScriptedBoard(Game.fromBoard(Board.parse(text), { ...level, moves: moves ?? level.moves }, 1));
      },
      showHint: () => {
        const move = app.currentGame?.hint();
        if (move) stage.view.showHint(move);
      },
      audioLoaded: () => audio.loadedCount(),
    };
  }
}

registerServiceWorker();
boot().catch((err: unknown) => {
  console.error(err);
  const fallback = document.getElementById('boot-error');
  if (fallback) fallback.hidden = false;
});
