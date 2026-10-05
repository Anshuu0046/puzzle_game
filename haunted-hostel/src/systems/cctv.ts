import * as THREE from 'three';
import { h, screen } from '../ui/dom';
import { t } from '../core/i18n';
import type { WorldCtx } from '../world/context';
import type { GhostBody } from '../enemy/ghost';
import { cctvMotionCam, cctvWatch, newCctvPuzzle, type CctvPuzzle } from './puzzles';
import { bus } from '../core/events';

export const CCTV_LAYER = 2;

interface Cam {
  label: string;
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Security monitor: six cameras rendered through the main pipeline with a phosphor CCTV look.
 * A phantom only cameras can see (render layer 2) walks the "follow the motion" puzzle and, at
 * the end, stands right behind the player in the security room.
 */
export class CctvSystem {
  readonly camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 80);
  readonly cams: Cam[];
  index = 1;
  open = false;
  puzzle: CctvPuzzle = newCctvPuzzle();
  private ui: { el: HTMLElement; close: () => void } | null = null;
  private labelEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private msgEl!: HTMLElement;
  private camButtons: HTMLButtonElement[] = [];
  private time = 0;
  glitch = 0;
  private nextGlitch = 3;
  private signalLost = 0;
  /** Archive mode shows the 2016 timestamp. */
  archive = false;
  private finale = 0;
  onSolved?: () => void;
  onClose?: () => void;
  private phantomStep = -1;
  /** The follow-the-motion puzzle only runs from chapter 3. */
  puzzleActive = false;

  constructor(
    private readonly ctx: WorldCtx,
    private readonly phantom: GhostBody,
  ) {
    this.camera.layers.enable(CCTV_LAYER);
    const p = (k: string, fb: THREE.Vector3) => ctx.points.get(k) ?? fb;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const corr = (f: number) => p(`cctv-corr${f}`, v(39, f * 3.4 + 2.7, 0.8));
    this.cams = [
      { label: t('cctv.cam1'), pos: p('cctv-lobby', v(21.2, 2.7, 4.95)), target: v(13.8, 1.2, 3.9) },
      {
        label: t('cctv.cam2'),
        pos: corr(0),
        target: corr(0)
          .clone()
          .add(v(-12, -1.6, -0.9)),
      },
      {
        label: t('cctv.cam3'),
        pos: corr(1),
        target: corr(1)
          .clone()
          .add(v(-12, -1.6, -0.9)),
      },
      {
        label: t('cctv.cam4'),
        pos: corr(2),
        target: corr(2)
          .clone()
          .add(v(-12, -1.6, -0.9)),
      },
      { label: t('cctv.cam5'), pos: p('cctv-stairs', v(0.35, 10.9, -4.8)), target: v(2.6, 7.6, -1.8) },
      {
        label: t('cctv.cam6'),
        pos: p('cctv-217', v(4.0, 9.5, 4.9)),
        target: p('room217', v(5.4, 6.8, 3.0))
          .clone()
          .setY(7.4),
      },
    ];
  }

  get active(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.ui = screen('cctv');
    const top = h('div', { class: 'top' });
    this.labelEl = h('div', { class: 'label' });
    this.timeEl = h('div', { class: 'label' });
    top.append(
      h('div', {}, h('div', { class: 'rec' }, '● REC'), this.labelEl),
      h('div', { style: 'text-align:right' }, h('div', {}, t('cctv.title')), this.timeEl),
    );
    const cams = h('div', { class: 'cams' });
    this.camButtons = this.cams.map((_, i) => {
      const b = h('button', {}, `0${i + 1}`) as HTMLButtonElement;
      b.onclick = () => this.select(i);
      cams.append(b);
      return b;
    });
    const exit = h('button', { class: 'hh-btn small' }, t('cctv.exit'));
    exit.onclick = () => this.hide();
    this.msgEl = h('div', { class: 'msg', style: 'display:none' });
    this.ui.el.append(top, this.msgEl, h('div', { class: 'bottom' }, cams, exit));
    this.select(this.puzzle.solved ? 0 : 3);
    bus.emit('sfx', { name: 'cctvStatic', volume: 0.5 });
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.ui?.close();
    this.ui = null;
    this.phantom.hide();
    this.phantomStep = -1;
    this.onClose?.();
  }

  select(i: number): void {
    this.index = i;
    this.glitch = 0.6;
    this.signalLost = 0;
    this.camButtons.forEach((b, k) => b.classList.toggle('on', k === i));
    this.labelEl.textContent = this.cams[i]!.label;
    bus.emit('sfx', { name: 'switchClick', volume: 0.5 });
  }

  private message(text: string | null): void {
    this.msgEl.style.display = text ? '' : 'none';
    if (text) this.msgEl.textContent = text;
  }

  /** Places the phantom for the current puzzle step. */
  private stagePhantom(): void {
    const step = this.puzzle.solved ? 99 : this.puzzle.step;
    if (step === this.phantomStep) return;
    this.phantomStep = step;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const ph = this.phantom;
    if (step === 0) {
      ph.snapIn(this.ctx.points.get('room217')?.clone() ?? v(8.6, 6.8, 3.0), Math.PI * 0.9);
      ph.play('standStill');
    } else if (step === 1) {
      ph.snapIn(v(2.7, 6.8, -2.0), 0);
      ph.play('idle');
    } else if (step === 2) {
      ph.snapIn(v(20, 0, -0.2), -Math.PI / 2);
      ph.play('walk');
    } else ph.hide();
  }

  update(dt: number): { glitch: number } {
    if (!this.open) return { glitch: 0 };
    this.time += dt;
    const cam = this.cams[this.index]!;
    // Slow pan sweep.
    const sweep = Math.sin(this.time * 0.25) * 0.9;
    const dir = cam.target.clone().sub(cam.pos);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), sweep * 0.25);
    this.camera.position.copy(cam.pos);
    this.camera.lookAt(cam.pos.clone().add(dir));
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // Timestamp — the date slips back to 2016 now and then.
    const now = new Date();
    const hh = 2;
    const mm = 7 + Math.floor(this.time / 60);
    const ss = Math.floor(this.time % 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    const slip = this.archive || (this.glitch > 0.3 && Math.random() < 0.5);
    this.timeEl.textContent = slip
      ? `14-11-2016  02:0${4 + (Math.floor(this.time) % 4)}:${pad(ss)}`
      : `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}  ${pad(hh)}:${pad(mm)}:${pad(ss)}`;

    // Random glitches and dropouts.
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0) {
      this.nextGlitch = 4 + Math.random() * 6;
      this.glitch = 0.5 + Math.random() * 0.5;
      if (Math.random() < 0.15) this.signalLost = 1.2;
    }
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
    if (this.signalLost > 0) {
      this.signalLost -= dt;
      this.message(t('cctv.noSignal'));
    } else if (this.finale <= 0) this.message(null);

    // Puzzle: follow the motion indicator.
    if (!this.puzzleActive) {
      this.camButtons.forEach((b) => b.classList.remove('motion'));
    } else if (!this.puzzle.solved) {
      this.stagePhantom();
      const motion = cctvMotionCam(this.puzzle);
      this.camButtons.forEach((b, k) => b.classList.toggle('motion', k === motion && Math.floor(this.time * 2) % 2 === 0));
      if (this.phantomStep === 2) {
        // She walks west along the ground floor corridor toward the lift.
        this.phantom.pos.x -= dt * 0.9;
        this.phantom.update(dt, this.time, 0.9, 99);
      } else this.phantom.update(dt, this.time, 0, 99);
      if (cctvWatch(this.puzzle, this.index, this.signalLost > 0 ? 0 : dt)) {
        this.glitch = 1;
        bus.emit('sfx', { name: 'cctvStatic', volume: 0.8 });
        if (this.puzzle.solved) this.startFinale();
      }
    } else if (this.finale > 0) {
      this.finale -= dt;
      this.phantom.update(dt, this.time, 0, 99);
      if (this.finale < 4.2 && this.finale + dt >= 4.2) {
        this.message(t('cctv.found'));
        this.archive = true;
      }
      if (this.finale <= 0) {
        this.message(null);
        this.onSolved?.();
      }
    }
    if (this.signalLost > 0) this.glitch = Math.max(this.glitch, 0.9);
    return { glitch: this.glitch };
  }

  /** Puzzle solved: CAM 01 shows her standing right behind the player's chair. */
  private startFinale(): void {
    this.finale = 7;
    this.camButtons.forEach((b) => b.classList.remove('motion'));
    this.select(0);
    this.phantom.snapIn(new THREE.Vector3(12.3, 0, 4.4), Math.PI / 2);
    this.phantom.play('standStill');
    bus.emit('scare', { kind: 'cctvBehind' });
  }

  reset(): void {
    this.puzzle = newCctvPuzzle();
    this.archive = false;
    this.finale = 0;
  }
}
