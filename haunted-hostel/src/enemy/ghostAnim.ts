import type { GhostRig } from './ghostModel';

export type Clip = 'idle' | 'walk' | 'stalk' | 'chase' | 'attack' | 'crawlPeek' | 'standStill';

interface Pose {
  rootY: number;
  hipsX: number;
  hipsZ: number;
  spineX: number;
  spineZ: number;
  chestX: number;
  neckX: number;
  headX: number;
  headY: number;
  headZ: number;
  jaw: number;
  shL: [number, number, number];
  shR: [number, number, number];
  elL: number;
  elR: number;
  wrL: number;
  wrR: number;
  thL: number;
  thR: number;
  knL: number;
  knR: number;
  finger: number;
}

const zero = (): Pose => ({
  rootY: 0,
  hipsX: 0,
  hipsZ: 0,
  spineX: 0,
  spineZ: 0,
  chestX: 0,
  neckX: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  jaw: 0,
  shL: [0, 0, 0],
  shR: [0, 0, 0],
  elL: 0,
  elR: 0,
  wrL: 0,
  wrR: 0,
  thL: 0,
  thR: 0,
  knL: 0,
  knR: 0,
  finger: 0,
});

/**
 * Procedural animation: each clip is a function of time (and gait phase) producing a pose;
 * clips are cross-faded by weight. Movement is deliberately "wrong": too-still idles broken by
 * sudden twitches, a head that tilts past comfortable angles, arms that hang dead while walking.
 */
export class GhostAnimator {
  private readonly weights: Record<Clip, number> = { idle: 1, walk: 0, stalk: 0, chase: 0, attack: 0, crawlPeek: 0, standStill: 0 };
  private target: Clip = 'idle';
  private phase = 0;
  private time = 0;
  private twitchT = 0;
  private twitch = { headY: 0, headZ: 0, sh: 0 };
  private nextTwitch = 2;
  /** Ground speed (m/s) drives the gait phase. */
  speed = 0;
  /** Extra head look offset (to face the player). */
  lookYaw = 0;
  lookPitch = 0;

  constructor(private readonly rig: GhostRig) {}

  play(c: Clip): void {
    this.target = c;
  }

  get clip(): Clip {
    return this.target;
  }

  update(dt: number): number {
    this.time += dt;
    const fade = this.target === 'attack' ? 10 : 3;
    for (const k of Object.keys(this.weights) as Clip[]) {
      const goal = k === this.target ? 1 : 0;
      this.weights[k] += (goal - this.weights[k]) * Math.min(1, dt * fade);
    }
    const stride = this.target === 'chase' ? 1.5 : this.target === 'stalk' ? 0.9 : 1.15;
    this.phase += (this.speed / stride) * Math.PI * dt;
    // Twitches.
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) {
      this.nextTwitch = 1.5 + Math.random() * 4;
      this.twitchT = 0.18;
      this.twitch = { headY: (Math.random() - 0.5) * 1.6, headZ: (Math.random() - 0.5) * 1.2, sh: (Math.random() - 0.5) * 0.6 };
    }
    if (this.twitchT > 0) this.twitchT -= dt;

    const out = zero();
    const add = (p: Pose, w: number) => {
      if (w < 0.001) return;
      for (const key of Object.keys(out) as (keyof Pose)[]) {
        const v = p[key];
        if (Array.isArray(v)) {
          const o = out[key] as [number, number, number];
          o[0] += v[0] * w;
          o[1] += v[1] * w;
          o[2] += v[2] * w;
        } else (out[key] as number) += (v as number) * w;
      }
    };
    add(this.idle(), this.weights.idle + this.weights.standStill);
    add(this.walk(false), this.weights.walk);
    add(this.stalk(), this.weights.stalk);
    add(this.walk(true), this.weights.chase);
    add(this.attack(), this.weights.attack);
    add(this.peek(), this.weights.crawlPeek);
    this.apply(out);
    return Math.sin(this.phase);
  }

  private idle(): Pose {
    const t = this.time;
    const p = zero();
    const breath = Math.sin(t * 1.1);
    p.chestX = breath * 0.02;
    p.spineX = 0.08;
    p.hipsZ = Math.sin(t * 0.37) * 0.02;
    // Head hangs, slowly tilting too far to one side.
    p.neckX = 0.25;
    p.headX = 0.2 + Math.sin(t * 0.23) * 0.05;
    p.headZ = 0.35 + Math.sin(t * 0.17) * 0.12;
    p.headY = Math.sin(t * 0.13) * 0.2;
    if (this.twitchT > 0) {
      p.headY += this.twitch.headY;
      p.headZ += this.twitch.headZ;
      p.shL[0] += this.twitch.sh;
    }
    // Arms hang dead, fingers slowly curling.
    p.shL = [0.05, 0, 0.08 + p.shL[0] * 0.2];
    p.shR = [0.05, 0, -0.06];
    p.elL = -0.1;
    p.elR = -0.15;
    p.finger = 0.3 + Math.sin(t * 0.6) * 0.15;
    p.jaw = 0.15 + Math.max(0, Math.sin(t * 0.4)) * 0.1;
    return p;
  }

  private walk(fast: boolean): Pose {
    const s = this.phase;
    const p = zero();
    const amp = fast ? 0.75 : 0.45;
    p.thL = Math.sin(s) * amp;
    p.thR = -Math.sin(s) * amp;
    p.knL = Math.max(0, -Math.cos(s)) * (fast ? 1.3 : 0.8);
    p.knR = Math.max(0, Math.cos(s)) * (fast ? 1.3 : 0.8);
    p.rootY = -Math.abs(Math.cos(s)) * (fast ? 0.05 : 0.025);
    p.hipsZ = Math.sin(s) * 0.05;
    p.spineX = fast ? 0.45 : 0.12;
    p.chestX = fast ? 0.15 : 0;
    p.neckX = fast ? -0.3 : 0.2;
    p.headX = fast ? -0.2 : 0.15;
    p.headZ = fast ? Math.sin(s * 2) * 0.15 : 0.3;
    p.headY = this.twitchT > 0 ? this.twitch.headY * 0.6 : 0;
    if (fast) {
      // Arms thrust forward, clawing.
      p.shL = [-1.25 + Math.sin(s) * 0.25, 0, 0.15];
      p.shR = [-1.3 - Math.sin(s) * 0.25, 0, -0.15];
      p.elL = -0.35;
      p.elR = -0.4;
      p.finger = 0.7;
      p.jaw = 0.6;
    } else {
      // Arms limp — they barely swing at all.
      p.shL = [-Math.sin(s) * 0.08, 0, 0.06];
      p.shR = [Math.sin(s) * 0.08, 0, -0.06];
      p.elL = -0.1;
      p.elR = -0.12;
      p.finger = 0.35;
      p.jaw = 0.2;
    }
    return p;
  }

  private stalk(): Pose {
    const s = this.phase;
    const t = this.time;
    const p = zero();
    p.rootY = -0.12 - Math.abs(Math.cos(s)) * 0.02;
    p.thL = Math.sin(s) * 0.35 - 0.3;
    p.thR = -Math.sin(s) * 0.35 - 0.3;
    p.knL = 0.5 + Math.max(0, -Math.cos(s)) * 0.6;
    p.knR = 0.5 + Math.max(0, Math.cos(s)) * 0.6;
    p.spineX = 0.4;
    p.chestX = 0.2;
    p.neckX = -0.35;
    p.headX = -0.1;
    p.headZ = 0.6 + Math.sin(t * 0.5) * 0.1;
    p.headY = this.twitchT > 0 ? this.twitch.headY : Math.sin(t * 0.7) * 0.2;
    p.shL = [-0.7 + Math.sin(s) * 0.1, 0, 0.25];
    p.shR = [-0.6 - Math.sin(s) * 0.1, 0, -0.25];
    p.elL = -0.6;
    p.elR = -0.5;
    p.wrL = 0.3;
    p.wrR = 0.3;
    p.finger = 0.55 + Math.sin(t * 3) * 0.15;
    p.jaw = 0.3;
    return p;
  }

  private attack(): Pose {
    const t = this.time;
    const p = zero();
    p.rootY = -0.05;
    p.spineX = 0.55;
    p.chestX = 0.2;
    p.neckX = -0.55;
    p.headX = -0.35;
    p.headZ = Math.sin(t * 40) * 0.06;
    p.headY = Math.sin(t * 33) * 0.05;
    p.shL = [-1.75, 0, 0.35];
    p.shR = [-1.8, 0, -0.35];
    p.elL = -0.15;
    p.elR = -0.2;
    p.wrL = -0.4;
    p.wrR = -0.4;
    p.thL = -0.4;
    p.thR = 0.3;
    p.knL = 0.6;
    p.knR = 0.2;
    p.finger = 1.0;
    p.jaw = 1.0;
    return p;
  }

  /** Bent sharply at the waist, head upside-down level, peeking around something. */
  private peek(): Pose {
    const t = this.time;
    const p = zero();
    p.spineX = 0.9;
    p.chestX = 0.3;
    p.neckX = -0.9;
    p.headZ = 1.4 + Math.sin(t * 0.8) * 0.1;
    p.headX = -0.2;
    p.shL = [-0.2, 0, 0.1];
    p.shR = [-0.2, 0, -0.1];
    p.thL = -0.1;
    p.thR = -0.1;
    p.finger = 0.4;
    p.jaw = 0.5;
    return p;
  }

  private apply(p: Pose): void {
    const r = this.rig;
    r.hips.position.y = 0.96 + p.rootY;
    r.hips.rotation.set(p.hipsX, 0, p.hipsZ);
    r.spine.rotation.set(p.spineX, 0, p.spineZ);
    r.chest.rotation.set(p.chestX, 0, 0);
    r.neck.rotation.set(p.neckX + this.lookPitch * 0.4, this.lookYaw * 0.4, 0);
    r.head.rotation.set(p.headX + this.lookPitch * 0.6, p.headY + this.lookYaw * 0.6, p.headZ);
    r.jaw.scale.y = 1 + p.jaw * 2.8;
    r.jaw.position.y = 0.035 - p.jaw * 0.012;
    r.shoulderL.rotation.set(p.shL[0], p.shL[1], p.shL[2]);
    r.shoulderR.rotation.set(p.shR[0], p.shR[1], p.shR[2]);
    r.elbowL.rotation.set(p.elL, 0, 0);
    r.elbowR.rotation.set(p.elR, 0, 0);
    r.wristL.rotation.set(p.wrL, 0, 0);
    r.wristR.rotation.set(p.wrR, 0, 0);
    r.thighL.rotation.set(-p.thL, 0, 0);
    r.thighR.rotation.set(-p.thR, 0, 0);
    r.kneeL.rotation.set(p.knL, 0, 0);
    r.kneeR.rotation.set(p.knR, 0, 0);
    for (const f of [...r.fingersL, ...r.fingersR]) f.rotation.x = -p.finger * 0.6;
  }
}
