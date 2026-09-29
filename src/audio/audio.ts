import { Howl, Howler } from 'howler';
import type { BoardEvent } from '../engine';
import { MUSIC_LENGTH, SFX, type SfxName, musicTones } from './sounds';
import { render } from './synth';
import { encodeWav } from './wav';

const SFX_RATE = 44100;
const MUSIC_RATE = 22050;
/** Same sound retriggered faster than this is skipped, so chains don't turn into noise. */
const RETRIGGER_MS = 45;

function toUrl(samples: Float32Array, rate: number): string {
  return URL.createObjectURL(new Blob([encodeWav(samples, rate) as BlobPart], { type: 'audio/wav' }));
}

/** Renders a loop so notes ringing past the end wrap around to the start (no click at the seam). */
function renderLoop(): Float32Array {
  const tail = 1;
  const full = render(musicTones(), MUSIC_RATE, { length: MUSIC_LENGTH + tail, peak: 0.85 });
  const n = Math.round(MUSIC_LENGTH * MUSIC_RATE);
  const loop = full.slice(0, n);
  for (let i = n; i < full.length; i++) loop[i - n]! += full[i]!;
  for (let i = 0; i < loop.length; i++) loop[i] = loop[i]! * 0.92;
  return loop;
}

/** All game sound: procedurally rendered SFX and music, played through Howler. */
export class GameAudio {
  private readonly sfx = new Map<SfxName, Howl>();
  private readonly lastPlayed = new Map<SfxName, number>();
  private music: Howl | null = null;
  private sfxEnabled = true;
  private musicEnabled = true;

  constructor() {
    try {
      for (const name of Object.keys(SFX) as SfxName[]) {
        this.sfx.set(name, new Howl({ src: [toUrl(render(SFX[name](), SFX_RATE), SFX_RATE)], format: ['wav'], volume: 0.6 }));
      }
    } catch (err) {
      console.warn('audio unavailable', err);
    }
  }

  get sfxOn(): boolean {
    return this.sfxEnabled;
  }

  get musicOn(): boolean {
    return this.musicEnabled;
  }

  setSfx(on: boolean): void {
    this.sfxEnabled = on;
  }

  setMusic(on: boolean): void {
    this.musicEnabled = on;
    if (on) this.startMusic();
    else this.music?.fade(this.music.volume(), 0, 300).once('fade', () => this.music?.pause());
  }

  /** Starts the loop (call from a user gesture; browsers block audio before one). */
  startMusic(): void {
    if (!this.musicEnabled) return;
    try {
      this.music ??= new Howl({ src: [toUrl(renderLoop(), MUSIC_RATE)], format: ['wav'], loop: true, volume: 0 });
      if (!this.music.playing()) {
        this.music.play();
        this.music.fade(0, 0.32, 1200);
      }
    } catch (err) {
      console.warn('music unavailable', err);
    }
  }

  /** How many effects have decoded (for the dev smoke test). */
  loadedCount(): { loaded: number; total: number } {
    const all = [...this.sfx.values()];
    return { loaded: all.filter((h) => h.state() === 'loaded').length, total: all.length };
  }

  /** Pauses everything while the page is hidden. */
  suspend(hidden: boolean): void {
    Howler.mute(hidden);
  }

  play(name: SfxName, opts: { rate?: number; volume?: number } = {}): void {
    if (!this.sfxEnabled) return;
    const howl = this.sfx.get(name);
    if (!howl) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < RETRIGGER_MS) return;
    this.lastPlayed.set(name, now);
    const id = howl.play();
    howl.rate(opts.rate ?? 1, id);
    howl.volume(opts.volume ?? 0.6, id);
  }

  /** Board sounds, in step with the animation timeline. */
  onBoardEvent(e: BoardEvent): void {
    switch (e.type) {
      case 'swapped':
        this.play('swap');
        break;
      case 'swapRejected':
        this.play('invalid');
        break;
      case 'matched':
        this.play('match', { rate: Math.min(1.9, 1 + (e.cascade - 1) * 0.12) });
        break;
      case 'specialCreated':
        this.play('special');
        break;
      case 'specialActivated':
        switch (e.effect) {
          case 'row':
          case 'column':
          case 'cross':
            this.play('line');
            break;
          case 'burst':
          case 'tripleCross':
          case 'megaBurst':
            this.play('burst');
            break;
          case 'colorClear':
            this.play('prism');
            break;
          case 'prismLines':
          case 'prismBursts':
          case 'boardWipe':
            this.play('bigCombo');
            break;
        }
        break;
      case 'shuffled':
        this.play('shuffle');
        break;
      default:
        break;
    }
  }
}
