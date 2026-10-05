import * as THREE from 'three';
import type { HideSpot } from '../world/context';
import type { PlayerController } from './controller';
import { bus } from '../core/events';

/**
 * Hiding: the camera moves into the hiding spot (cupboard crack, under a bed, behind a curtain,
 * inside a stall), movement is locked and look is clamped. Holding breath lowers the chance of
 * being found during an inspection but drains stamina.
 */
export class HidingSystem {
  spot: HideSpot | null = null;
  private t = 0;
  private entering = false;
  private leaving = false;
  private readonly from = new THREE.Vector3();
  private fromYaw = 0;
  private fromPitch = 0;
  holdingBreath = false;
  breath = 1;
  /** Set while the ghost was watching when the player entered. */
  seenEntering = false;
  private baseYaw = 0;

  constructor(private readonly player: PlayerController) {}

  get hidden(): boolean {
    return !!this.spot && !this.leaving;
  }

  enter(spot: HideSpot, seen: boolean): void {
    if (this.spot) return;
    this.spot = spot;
    this.t = 0;
    this.entering = true;
    this.leaving = false;
    this.seenEntering = seen;
    this.from.copy(this.player.pos);
    this.fromYaw = this.player.yaw;
    this.fromPitch = this.player.pitch;
    this.baseYaw = spot.yaw;
    this.player.frozen = true;
    this.animateParts(true);
    bus.emit('sfx', {
      name: spot.kind === 'almirah' ? 'doorOpen' : spot.kind === 'stall' ? 'doorLatch' : 'pageTurn',
      pos: spot.exit,
      volume: 0.5,
    });
    bus.emit('noise', { pos: spot.exit.clone(), loudness: 0.25, kind: 'door' });
  }

  leave(): void {
    if (!this.spot || this.leaving) return;
    this.leaving = true;
    this.t = 0;
    this.animateParts(true);
  }

  /** Forced exit (caught). */
  eject(): void {
    if (!this.spot) return;
    this.player.place(this.spot.exit, this.player.yaw, 0);
    this.animateParts(false);
    this.spot = null;
    this.player.frozen = false;
    this.leaving = false;
  }

  private animateParts(open: boolean): void {
    const s = this.spot;
    if (!s) return;
    for (const p of s.parts) {
      p.userData.hideOpen = open ? 1 : 0;
    }
  }

  update(dt: number, breathHeld: boolean): void {
    // Door/curtain animation for every spot part, even after leaving.
    const s = this.spot;
    if (!s) {
      this.breath = Math.min(1, this.breath + dt * 0.3);
      this.holdingBreath = false;
      return;
    }
    this.t += dt;
    for (const p of s.parts) {
      const target = (p.userData.hideOpen as number) ?? 0;
      const cur = (p.userData.hideCur as number) ?? 0;
      const next = cur + (target - cur) * Math.min(1, dt * 6);
      p.userData.hideCur = next;
      if (s.kind === 'almirah') p.rotation.y = (p.userData.side as number) * next * 1.3;
      else if (s.kind === 'stall') p.rotation.y = (p.userData.baseRot ??= p.rotation.y) - next * 1.2;
      else if (s.kind === 'curtain') p.scale.x = 1 - next * 0.35;
    }
    if (this.entering) {
      const k = Math.min(1, this.t / 0.7);
      const e = k * k * (3 - 2 * k);
      this.player.yaw = lerpAngle(this.fromYaw, this.baseYaw, e);
      this.player.pitch = this.fromPitch * (1 - e);
      if (k >= 1) {
        this.entering = false;
        // Close the doors behind you.
        for (const p of s.parts) p.userData.hideOpen = s.kind === 'curtain' ? 0 : 0.08;
      }
    } else if (this.leaving) {
      if (this.t > 0.45) {
        this.player.place(s.exit, this.player.yaw, 0);
        this.player.frozen = false;
        for (const p of s.parts) p.userData.hideOpen = 0;
        this.spot = null;
        this.leaving = false;
        return;
      }
    } else {
      // Clamp the view to a cone around the spot's facing.
      let d = this.player.yaw - this.baseYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const lim = s.kind === 'bed' ? 0.9 : 0.7;
      if (d > lim) this.player.yaw = this.baseYaw + lim;
      if (d < -lim) this.player.yaw = this.baseYaw - lim;
      this.player.pitch = Math.max(-0.5, Math.min(s.kind === 'bed' ? 0.15 : 0.5, this.player.pitch));
    }
    this.holdingBreath = breathHeld && this.breath > 0 && !this.entering && !this.leaving;
    if (this.holdingBreath) {
      this.breath -= dt / 7;
      if (this.breath <= 0) {
        this.breath = 0;
        // Gasp — loud.
        bus.emit('sfx', { name: 'breathingHeavyOnce', volume: 1 });
        bus.emit('noise', { pos: s.cam.clone(), loudness: 0.5, kind: 'voice' });
      }
    } else this.breath = Math.min(1, this.breath + dt * 0.15);
  }

  /** Camera pose while hidden (overrides the controller's camera). */
  applyCamera(camera: THREE.Camera, time: number): void {
    const s = this.spot;
    if (!s) return;
    const k = this.entering ? Math.min(1, this.t / 0.7) : this.leaving ? 1 - Math.min(1, this.t / 0.45) : 1;
    const e = k * k * (3 - 2 * k);
    const eye = this.from.clone().setY(this.from.y + 1.6);
    const p = eye.lerp(s.cam, e);
    // Shallow, shaky breathing while hidden.
    const amp = this.holdingBreath ? 0.0015 : 0.006;
    p.y += Math.sin(time * (this.holdingBreath ? 1 : 2.4)) * amp;
    p.x += Math.sin(time * 17) * 0.0015 * (1 - this.breath);
    camera.position.copy(p);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.player.pitch, this.player.yaw, Math.sin(time * 1.3) * 0.004);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}
