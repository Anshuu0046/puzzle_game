import './ui/style.css';
import { GameAudio } from './audio/audio';
import { LEVELS, levelById } from './data/levels';
import { SaveStore, browserStorage } from './data/save';
import { Board, Game, type Pos } from './engine';
import { BoardStage } from './render/stage';
import { App } from './ui/app';

declare global {
  interface Window {
    /** Dev-only hooks used by the Playwright screenshot script. */
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

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
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
  document.body.classList.add('ready');

  if (import.meta.env.DEV) {
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

boot().catch((err: unknown) => {
  console.error(err);
  const fallback = document.getElementById('boot-error');
  if (fallback) fallback.hidden = false;
});
