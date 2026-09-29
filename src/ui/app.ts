import { gsap } from 'gsap';
import type { GameAudio } from '../audio/audio';
import { LEVELS, levelById } from '../data/levels';
import type { SaveStore } from '../data/save';
import { Game, type LevelConfig, type Pos } from '../engine';
import { BoardInput } from '../render/boardInput';
import { MOTION } from '../render/motion';
import type { BoardStage } from '../render/stage';
import { Hud } from './hud';
import { MapScreen } from './map';
import { Modal } from './modal';
import { introContent, loseContent, pauseContent, settingsContent, winContent } from './popups';
import { TitleScreen } from './title';

/** Screen margins around the board, on the 8px grid. */
const SIDE_MARGIN = 16;
const HUD_GAP = 16;
const BOTTOM_MARGIN = 24;
/** Idle time before the board suggests a move. */
const HINT_DELAY_MS = 5000;

export interface AppDeps {
  readonly stage: BoardStage;
  readonly audio: GameAudio;
  readonly save: SaveStore;
  readonly screens: HTMLElement;
  readonly hudEl: HTMLElement;
  readonly modalRoot: HTMLElement;
  /** Fixed seed for reproducible screenshots; random otherwise. */
  readonly seed?: number;
}

type Screen = 'title' | 'map' | 'level';

/** Screen flow: title → map → level (intro, play, finale, result) and back. */
export class App {
  private screen: Screen = 'title';
  private game: Game | null = null;
  private level: LevelConfig | null = null;
  /** Input locked: intro showing, paused, or level over. */
  private locked = true;
  private paused = false;
  private hintTimer = 0;
  private readonly title: TitleScreen;
  private readonly map: MapScreen;
  private readonly hud: Hud;
  private readonly modal: Modal;
  private readonly input: BoardInput;

  constructor(private readonly d: AppDeps) {
    this.title = new TitleScreen(
      () => this.click(() => this.showMap()),
      () => this.click(() => this.openSettings()),
    );
    this.map = new MapScreen(
      (id) => this.click(() => this.openLevel(id)),
      () => this.click(() => this.showTitle()),
      () => this.click(() => this.openSettings()),
    );
    this.hud = new Hud(d.hudEl, () => this.click(() => this.pause()));
    this.modal = new Modal(d.modalRoot);
    d.screens.append(this.title.el, this.map.el);

    const view = d.stage.view;
    view.onEvent = (e) => {
      d.audio.onBoardEvent(e);
      if (e.type === 'goals') this.hud.setGoals(e.goals);
      if (e.type === 'bonusMove') this.hud.setMoves(e.movesLeft);
    };
    view.onScore = (total) => this.hud.setScore(total);
    this.input = new BoardInput(
      view,
      (a, b) => this.onSwap(a, b),
      () => this.locked || view.busy,
    );

    d.audio.setSfx(d.save.settings.sfx);
    d.audio.setMusicEnabled(d.save.settings.music);

    const scheduleLayout = () => requestAnimationFrame(() => void this.relayout());
    window.addEventListener('resize', scheduleLayout);
    void document.fonts?.ready.then(scheduleLayout);
    window.addEventListener('pointerdown', () => this.poke(), { capture: true });
    window.addEventListener('keydown', (e) => {
      this.poke();
      if (this.screen !== 'level' || this.modal.isOpen) return;
      if (e.key === 'Escape') this.pause();
      // Enter/Space on a focused button (e.g. Pause) belong to that button.
      else if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return;
      else if (this.input.handleKey(e)) {
        e.preventDefault();
        // Arrow keys move play to the board: release focus from HUD buttons so Enter reaches it.
        if (e.key.startsWith('Arrow') && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
    });
    // Pixi restores the GPU context itself; pausing keeps the player from acting on a blank board.
    d.stage.onContextLost = () => this.pause();
    document.addEventListener('visibilitychange', () => {
      d.audio.suspend(document.hidden);
      if (document.hidden) this.pause();
    });
  }

  /** Current game, for dev tooling. */
  get currentGame(): Game | null {
    return this.game;
  }

  get isIdle(): boolean {
    return !this.d.stage.view.busy;
  }

  start(): void {
    this.showTitle();
  }

  showTitle(): void {
    this.leaveLevel();
    this.setScreen('title');
  }

  showMap(focusLevel?: number): void {
    this.leaveLevel();
    this.setScreen('map');
    this.map.render(this.d.save);
    // Locked levels are disabled buttons and can't take focus.
    const target = Math.min(focusLevel ?? Infinity, this.d.save.unlockedUpTo);
    this.map.scrollToLevel(target);
    this.map.focusLevel(target);
  }

  /** Sets up a level behind its intro card. */
  openLevel(id: number, skipIntro = false): void {
    const level = levelById(id);
    if (!level) return;
    this.leaveLevel();
    this.level = level;
    this.game = Game.start(level, this.d.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.setScreen('level');
    const view = this.d.stage.view;
    view.setBoard(this.game.board);
    this.hud.setLevel(level, this.game.goals);
    this.hud.setMoves(this.game.movesLeft);
    this.hud.setScore(0, false);
    void this.relayout();
    this.locked = true;
    if (skipIntro) {
      this.begin();
      return;
    }
    this.modal.open(
      introContent(
        level,
        this.game.goals,
        this.d.save.record(id),
        () => this.click(() => this.begin()),
        () => this.click(() => this.showMap(id)),
      ),
      { label: `Level ${id}`, variant: 'intro', onDismiss: () => this.showMap(id) },
    );
  }

  private begin(): void {
    this.modal.close();
    this.locked = false;
    this.scheduleHint();
  }

  private onSwap(a: Pos, b: Pos): void {
    const game = this.game;
    const view = this.d.stage.view;
    if (!game || this.locked || view.busy || game.status !== 'playing') return;
    let result: ReturnType<Game['trySwap']>;
    try {
      result = game.trySwap(a, b);
    } catch (err) {
      // Should never happen with validated levels; recover by restarting rather than freezing.
      console.error('turn failed, restarting level', err);
      this.openLevel(this.level!.id, true);
      return;
    }
    if (result.events.length === 0) return;
    if (result.accepted) this.hud.setMoves(game.movesLeft);
    if (game.status !== 'playing') this.locked = true;
    void view.play(result.events).then(() => {
      if (this.game !== game) return;
      if (game.status === 'won') void this.celebrate(game);
      else if (game.status === 'lost') this.showResult(game);
      else this.scheduleHint();
    });
  }

  /** Cash in leftover moves, then show the result. */
  private async celebrate(game: Game): Promise<void> {
    if (game.canFinale) {
      // The finale plays fast, and any tap fast-forwards it.
      const timeline = gsap.globalTimeline;
      timeline.timeScale(MOTION.finaleSpeed);
      const skip = () => timeline.timeScale(MOTION.finaleSkipSpeed);
      window.addEventListener('pointerdown', skip);
      try {
        await this.d.stage.view.play(game.finale().events);
      } finally {
        window.removeEventListener('pointerdown', skip);
        timeline.timeScale(1);
      }
      if (this.game !== game) return;
    }
    this.showResult(game);
  }

  private showResult(game: Game): void {
    const level = this.level!;
    const won = game.status === 'won';
    const next = levelById(level.id + 1);
    window.clearTimeout(this.hintTimer);
    if (won) {
      const stars = game.stars;
      const { newBest } = this.d.save.recordResult(level.id, game.score, stars);
      this.d.audio.play('win');
      for (let i = 0; i < stars; i++) window.setTimeout(() => this.d.audio.play('star', { rate: 1 + i * 0.12 }), 300 + i * 350);
      this.modal.open(
        winContent(level, game.score, stars, newBest, {
          onNext: next ? () => this.click(() => this.openLevel(next.id)) : null,
          onReplay: () => this.click(() => this.openLevel(level.id, true)),
          onMap: () => this.click(() => this.showMap(next?.id ?? level.id)),
        }),
        { label: 'Level complete', variant: 'win' },
      );
    } else {
      this.d.audio.play('lose');
      this.modal.open(
        loseContent(
          level,
          game.goals,
          () => this.click(() => this.openLevel(level.id, true)),
          () => this.click(() => this.showMap(level.id)),
        ),
        { label: 'Out of moves', variant: 'lose' },
      );
    }
  }

  /** Freezes the board (animations included) behind the pause card. */
  pause(): void {
    if (this.screen !== 'level' || this.paused || this.modal.isOpen || !this.game || this.game.status !== 'playing') return;
    this.paused = true;
    this.locked = true;
    window.clearTimeout(this.hintTimer);
    gsap.globalTimeline.pause();
    this.d.stage.setRunning(false);
    const s = this.d.save.settings;
    this.modal.open(
      pauseContent(this.level!, this.game.goals, s, {
        onResume: () => this.click(() => this.resume()),
        onRestart: () => this.click(() => this.openLevel(this.level!.id, true)),
        onMap: () => this.click(() => this.showMap(this.level!.id)),
        onSfx: (on) => this.setSfx(on),
        onMusic: (on) => this.setMusic(on),
      }),
      { label: 'Paused', onDismiss: () => this.resume() },
    );
  }

  private resume(): void {
    if (!this.paused) return;
    this.unfreeze();
    this.modal.close();
    this.locked = false;
    this.scheduleHint();
  }

  private unfreeze(): void {
    if (!this.paused) return;
    this.paused = false;
    gsap.globalTimeline.resume();
    this.d.stage.setRunning(this.screen === 'level');
  }

  private openSettings(): void {
    const close = () => this.modal.close();
    this.modal.open(
      settingsContent(this.d.save.settings, {
        onSfx: (on) => this.setSfx(on),
        onMusic: (on) => this.setMusic(on),
        onReset: () => {
          this.d.save.reset();
          close();
          if (this.screen === 'map') this.showMap();
        },
        onClose: () => this.click(close),
      }),
      { label: 'Settings', onDismiss: close },
    );
  }

  private setSfx(on: boolean): void {
    this.d.save.setSettings({ sfx: on });
    this.d.audio.setSfx(on);
    this.d.audio.play('button');
  }

  private setMusic(on: boolean): void {
    this.d.save.setSettings({ music: on });
    this.d.audio.setMusic(on);
  }

  private leaveLevel(): void {
    this.unfreeze();
    gsap.globalTimeline.timeScale(1);
    this.modal.close();
    window.clearTimeout(this.hintTimer);
    this.game = null;
    this.level = null;
    this.locked = true;
  }

  private setScreen(screen: Screen): void {
    this.screen = screen;
    this.title.el.hidden = screen !== 'title';
    this.map.el.hidden = screen !== 'map';
    this.hud.show(screen === 'level');
    this.d.stage.setVisible(screen === 'level');
  }

  private async relayout(): Promise<void> {
    if (this.screen !== 'level') return;
    const top = this.hud.el.getBoundingClientRect().bottom + HUD_GAP;
    await this.d.stage.layout({
      x: SIDE_MARGIN,
      y: top,
      width: window.innerWidth - SIDE_MARGIN * 2,
      height: window.innerHeight - top - BOTTOM_MARGIN,
    });
  }

  /** Any input restarts the idle-hint countdown. */
  private poke(): void {
    if (this.screen === 'level' && !this.locked) this.scheduleHint();
  }

  private scheduleHint(): void {
    window.clearTimeout(this.hintTimer);
    this.d.stage.view.clearHint();
    this.hintTimer = window.setTimeout(() => {
      const game = this.game;
      if (!game || this.locked || this.d.stage.view.busy || game.status !== 'playing') return;
      const move = game.hint();
      if (move) this.d.stage.view.showHint(move);
    }, HINT_DELAY_MS);
  }

  private click(action: () => void): void {
    this.d.audio.play('button');
    action();
  }

  /** Dev hook: jump straight into a level with a scripted board. */
  loadScriptedBoard(game: Game): void {
    this.game = game;
    this.level = game.level;
    this.d.stage.view.setBoard(game.board);
    this.hud.setLevel(game.level, game.goals);
    this.hud.setMoves(game.movesLeft);
    this.hud.setScore(game.score, false);
    this.modal.close();
    this.locked = false;
  }

  get levelCount(): number {
    return LEVELS.length;
  }
}
