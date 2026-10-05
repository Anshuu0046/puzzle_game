import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { Input } from './input';
import { bus } from '../core/events';
import { OUTER, OUTER_T, XMAX, ROOF_Y } from '../world/layout';

export const STAND_H = 1.75;
export const CROUCH_H = 1.15;
const RADIUS = 0.28;
const STEP_UP = 0.36;
const GRAVITY = 14;

export type Surface = 'tile' | 'concrete' | 'wet' | 'metal' | 'mud';

/**
 * First-person controller: cylinder vs AABB collision, stairs by step-up, sprint with stamina,
 * smooth crouch, jump, head bob with footstep events, breathing sway and a trauma-based shake.
 */
export class PlayerController {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  private roll = 0;
  height = STAND_H;
  crouching = false;
  grounded = true;
  stamina = 1;
  private exhaustedUntil = 0;
  private bobPhase = 0;
  private lastStepSide = 0;
  private eyeY = 0;
  private smoothY = 0;
  /** 0..1 screen shake amount, decays. */
  trauma = 0;
  /** 0..1 tension (drives breathing intensity and camera unsteadiness). */
  fear = 0;
  /** True while moving at sprint speed this frame. */
  sprinting = false;
  speed = 0;
  /** Locks movement (cutscenes, hiding, menus) but still updates the camera. */
  frozen = false;
  sensitivity = 1;
  invertY = false;
  headBob = true;
  private time = 0;
  /** Last noise emission time, to rate-limit. */
  noiseLevel = 0;
  /** Surface override for the current frame (set by the game from world zones). */
  surface: Surface = 'tile';
  /** Camera look target for forced looks (scares). */
  private forced: { yaw: number; pitch: number; t: number } | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly col: CollisionWorld,
    private readonly input: Input,
  ) {}

  place(p: THREE.Vector3, yaw: number, pitch = 0): void {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.smoothY = p.y;
    this.eyeY = this.height - 0.13;
    const g = this.col.groundHeight(p.x, p.z, RADIUS, p.y + 1.0);
    if (g > -Infinity) this.pos.y = g;
    this.smoothY = this.pos.y;
  }

  /** Smoothly turns the view toward a point (used by scares). */
  lookAt(target: THREE.Vector3, seconds = 0.35): void {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dy = target.y - (this.pos.y + this.eyeY);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.forced = { yaw, pitch, t: seconds };
  }

  get floor(): number {
    return Math.max(0, Math.min(3, Math.floor((this.pos.y + 0.6) / 3.4)));
  }

  get outdoors(): boolean {
    const p = this.pos;
    if (p.y > ROOF_Y - 0.2 && !(p.x < 3.75 && p.z < 5.6)) return true;
    return p.x < -0.2 || p.x > XMAX + 0.2 || p.z > OUTER + OUTER_T || p.z < -OUTER - OUTER_T;
  }

  update(dt: number): void {
    this.time += dt;
    const inp = this.input;
    // ---- Look ----
    const sens = 0.0022 * this.sensitivity;
    if (!this.forced) {
      this.yaw -= inp.look.x * sens;
      this.pitch -= inp.look.y * sens * (this.invertY ? -1 : 1);
    } else {
      const k = Math.min(1, dt / Math.max(0.05, this.forced.t));
      let dy = this.forced.yaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, k * 4);
      this.pitch += (this.forced.pitch - this.pitch) * Math.min(1, k * 4);
      this.forced.t -= dt;
      if (this.forced.t <= 0) this.forced = null;
    }
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    // ---- Movement ----
    const wantsCrouch = inp.crouchToggled || inp.isHeld('crouch');
    if (wantsCrouch) this.crouching = true;
    else if (this.crouching) {
      // Only stand up if there is headroom.
      const ceil = this.col.ceilingHeight(this.pos.x, this.pos.z, RADIUS * 0.9, this.pos.y + CROUCH_H - 0.05);
      if (ceil > this.pos.y + STAND_H + 0.02) this.crouching = false;
      else inp.crouchToggled = true;
    }
    const targetH = this.crouching ? CROUCH_H : STAND_H;
    this.height += (targetH - this.height) * Math.min(1, dt * 10);

    let mx = this.frozen ? 0 : inp.move.x;
    let my = this.frozen ? 0 : inp.move.y;
    const moving = Math.hypot(mx, my) > 0.05;
    const now = this.time;
    const canSprint = !this.crouching && my > 0.3 && now > this.exhaustedUntil && this.stamina > 0.02;
    this.sprinting = !this.frozen && inp.sprinting && canSprint && moving;
    const base = this.crouching ? 1.05 : this.sprinting ? 4.3 : 2.0;
    if (this.sprinting) {
      this.stamina -= dt / 7.5;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhaustedUntil = now + 2.5;
        bus.emit('sfx', { name: 'breathingHeavyOnce', volume: 0.8 });
      }
    } else {
      this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.1 : 0.18));
    }
    // Backwards and sideways are slower.
    if (my < 0) my *= 0.7;
    mx *= 0.85;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = (mx * cos - my * sin) * base;
    const wishZ = (-mx * sin - my * cos) * base;
    const accel = this.grounded ? 12 : 2;
    this.vel.x += (wishX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, accel * dt);

    if (!this.frozen && this.grounded && this.input.consume('jump') && !this.crouching && this.stamina > 0.1) {
      this.vel.y = 4.0;
      this.grounded = false;
      this.stamina -= 0.08;
    }
    this.vel.y -= GRAVITY * dt;

    // Integrate horizontally in small steps so fast moves can't tunnel through thin walls.
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.12));
    for (let i = 0; i < steps; i++) {
      this.pos.x += (this.vel.x * dt) / steps;
      this.pos.z += (this.vel.z * dt) / steps;
      this.col.resolveCylinder(this.pos, RADIUS, this.height, this.grounded ? STEP_UP : 0.05);
    }
    // Vertical.
    this.pos.y += this.vel.y * dt;
    const ground = this.col.groundHeight(this.pos.x, this.pos.z, RADIUS, this.pos.y + STEP_UP);
    if (ground > -Infinity && this.pos.y <= ground + 0.001) {
      if (!this.grounded && this.vel.y < -5) {
        this.trauma = Math.min(1, this.trauma + 0.25);
        bus.emit('noise', { pos: this.pos.clone(), loudness: 0.45, kind: 'step' });
        this.footstep(0.9);
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (ground > -Infinity && this.grounded && this.pos.y - ground < STEP_UP && this.vel.y <= 0) {
      // Stick to the ground when walking down stairs.
      this.pos.y = ground;
      this.vel.y = 0;
    } else {
      this.grounded = false;
    }
    const ceil = this.col.ceilingHeight(this.pos.x, this.pos.z, RADIUS * 0.8, this.pos.y + 0.5);
    if (ceil < this.pos.y + this.height) {
      this.pos.y = Math.min(this.pos.y, ceil - this.height);
      if (this.vel.y > 0) this.vel.y = 0;
    }
    if (this.pos.y < -20) this.pos.set(18, 0, 30);

    // ---- Head bob + footsteps ----
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && this.speed > 0.3) {
      const prev = this.bobPhase;
      this.bobPhase += dt * this.speed * (this.sprinting ? 2.3 : 2.7);
      const side = Math.floor(this.bobPhase / Math.PI);
      if (side !== Math.floor(prev / Math.PI) && side !== this.lastStepSide) {
        this.lastStepSide = side;
        this.footstep(this.sprinting ? 1 : this.crouching ? 0.3 : 0.6);
      }
    } else {
      this.bobPhase += (Math.round(this.bobPhase / Math.PI) * Math.PI - this.bobPhase) * Math.min(1, dt * 4);
    }
    this.trauma = Math.max(0, this.trauma - dt * 0.8);
    this.applyCamera(dt);
  }

  private footstep(intensity: number): void {
    const loud = this.sprinting ? 0.85 : this.crouching ? 0.12 : 0.38;
    this.noiseLevel = loud;
    bus.emit('noise', { pos: this.pos.clone(), loudness: loud, kind: 'step' });
    bus.emit('sfx', { name: `step:${this.surface}`, volume: 0.35 + intensity * 0.5, rate: 0.92 + Math.random() * 0.16 });
  }

  /** Writes the camera transform from the body state. */
  applyCamera(dt: number): void {
    const eyeTarget = this.height - 0.13;
    this.eyeY += (eyeTarget - this.eyeY) * Math.min(1, dt * 12);
    // Smooth vertical motion on stairs.
    this.smoothY += (this.pos.y - this.smoothY) * Math.min(1, dt * 14);
    if (Math.abs(this.pos.y - this.smoothY) > 0.6) this.smoothY = this.pos.y;
    const bobAmt = this.headBob ? (this.sprinting ? 1.5 : 1) : 0.2;
    const by = Math.abs(Math.sin(this.bobPhase)) * 0.045 * bobAmt * Math.min(1, this.speed / 2);
    const bx = Math.cos(this.bobPhase) * 0.025 * bobAmt * Math.min(1, this.speed / 2);
    // Idle breathing, stronger when afraid or exhausted.
    const breath =
      (0.006 + this.fear * 0.01 + (1 - this.stamina) * 0.01) * Math.sin(this.time * (1.6 + this.fear * 2 + (1 - this.stamina) * 2));
    const shake = this.trauma * this.trauma;
    const sx = (Math.sin(this.time * 47.3) + Math.sin(this.time * 31.1)) * 0.5 * shake * 0.06;
    const sy = (Math.sin(this.time * 41.7) + Math.sin(this.time * 23.9)) * 0.5 * shake * 0.06;
    const fearJitter = this.fear * 0.004 * Math.sin(this.time * 13.7);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(this.pos.x, this.smoothY + this.eyeY + by + breath, this.pos.z).addScaledVector(right, bx);
    const strafe = this.input.move.x * (this.frozen ? 0 : 1);
    this.roll += (-strafe * 0.012 - this.roll) * Math.min(1, dt * 6);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + sy + fearJitter, this.yaw + sx, this.roll + bx * 0.2 + shake * 0.02 * Math.sin(this.time * 19));
  }
}
