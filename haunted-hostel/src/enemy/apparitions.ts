import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { GhostBody } from './ghost';
import type { Clip } from './ghostAnim';
import { bus } from '../core/events';

export interface ApparitionSpec {
  pos: THREE.Vector3;
  /** Yaw she faces; null = face the player. */
  yaw: number | null;
  clip?: Clip;
  /** Vanish when the player looks straight at her (psychological horror). */
  vanishOnLook?: boolean;
  /** Vanish when the player gets closer than this. */
  vanishDist?: number;
  /** Max seconds on screen. */
  duration?: number;
  /** Walk toward this point while visible (shadow crossing a corridor). */
  walkTo?: THREE.Vector3;
  walkSpeed?: number;
  instant?: boolean;
  sound?: string;
  onLooked?: () => void;
  onEnd?: () => void;
}

/**
 * Brief glimpses of her: at the end of a corridor, at the top of the stairs, through a window,
 * behind a curtain. She is there just long enough to be doubted and disappears when stared at.
 */
export class ApparitionSystem {
  private spec: ApparitionSpec | null = null;
  private t = 0;
  private lookedT = 0;
  private time = 0;
  private readonly fwd = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();

  constructor(
    readonly body: GhostBody,
    private readonly col: CollisionWorld,
  ) {
    body.audible = false;
  }

  get busy(): boolean {
    return !!this.spec;
  }

  show(spec: ApparitionSpec, camera: THREE.Camera): void {
    this.end(true);
    this.spec = spec;
    this.t = 0;
    this.lookedT = 0;
    camera.getWorldPosition(this.camPos);
    const yaw = spec.yaw ?? Math.atan2(this.camPos.x - spec.pos.x, this.camPos.z - spec.pos.z);
    if (spec.instant) this.body.snapIn(spec.pos, yaw);
    else this.body.materialize(spec.pos, yaw, 2.5);
    this.body.play(spec.walkTo ? 'walk' : (spec.clip ?? 'idle'));
    if (spec.sound) bus.emit('sfx', { name: spec.sound, pos: spec.pos.clone().setY(spec.pos.y + 1.5), volume: 0.8 });
  }

  end(immediate = false): void {
    if (!this.spec) return;
    const s = this.spec;
    this.spec = null;
    if (immediate) this.body.hide();
    else this.body.vanish(3);
    s.onEnd?.();
  }

  /** Is the player looking at a point (with line of sight)? */
  looking(camera: THREE.Camera, p: THREE.Vector3, cosLimit = 0.97): boolean {
    camera.getWorldPosition(this.camPos);
    camera.getWorldDirection(this.fwd);
    const to = p.clone().sub(this.camPos);
    const d = to.length();
    if (d < 0.01) return true;
    to.divideScalar(d);
    if (to.dot(this.fwd) < cosLimit) return false;
    return !this.col.segmentBlocked(this.camPos.x, this.camPos.y, this.camPos.z, p.x, p.y, p.z, 'door');
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const s = this.spec;
    const b = this.body;
    let speed = 0;
    if (s) {
      this.t += dt;
      if (s.walkTo) {
        const d = s.walkTo.clone().sub(b.pos);
        d.y = 0;
        const len = d.length();
        speed = s.walkSpeed ?? 1.4;
        if (len < 0.1) {
          this.end();
        } else {
          b.pos.addScaledVector(d.normalize(), Math.min(len, speed * dt));
          b.yaw = Math.atan2(d.x, d.z);
        }
      } else {
        camera.getWorldPosition(this.camPos);
        b.lookAt(this.camPos);
      }
      const head = b.pos.clone().setY(b.pos.y + 1.4);
      if (s.vanishOnLook && this.t > 0.5 && this.looking(camera, head, 0.985)) {
        this.lookedT += dt;
        if (this.lookedT > 0.35) {
          s.onLooked?.();
          bus.emit('sfx', { name: `whisper${Math.floor(Math.random() * 4)}`, pos: head, volume: 0.6 });
          this.end();
        }
      }
      if (this.spec && s.vanishDist) {
        camera.getWorldPosition(this.camPos);
        if (this.camPos.distanceTo(b.pos) < s.vanishDist) this.end();
      }
      if (this.spec && this.t > (s.duration ?? 8)) this.end();
    }
    b.update(dt, this.time, speed, 99);
  }
}
