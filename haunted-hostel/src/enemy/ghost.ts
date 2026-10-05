import * as THREE from 'three';
import type { MaterialLibrary } from '../render/textures/materials';
import { buildGhost, type GhostRig } from './ghostModel';
import { GhostAnimator, type Clip } from './ghostAnim';
import { bus } from '../core/events';

/**
 * One ghost body: rig + animator + materialise/dematerialise control + footstep audio.
 * Used by the hunting AI, by scripted apparitions and (on separate render layers) by the
 * CCTV-only and mirror-only phantoms.
 */
export class GhostBody {
  readonly rig: GhostRig;
  readonly anim: GhostAnimator;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  /** 0 visible … 1 gone. */
  dissolve = 1;
  private dissolveTarget = 1;
  private dissolveSpeed = 1.5;
  private lastStep = 0;
  /** Emit positional footsteps and breathing. */
  audible = true;
  private breathT = 3;

  constructor(
    scene: THREE.Scene,
    mats: MaterialLibrary,
    readonly layer = 0,
  ) {
    this.rig = buildGhost(mats);
    this.anim = new GhostAnimator(this.rig);
    if (layer) this.rig.root.traverse((o) => o.layers.set(layer));
    this.rig.root.visible = false;
    scene.add(this.rig.root);
  }

  get visible(): boolean {
    return this.rig.root.visible && this.dissolve < 0.95;
  }

  /** Fades in at a position. */
  materialize(pos: THREE.Vector3, yaw: number, speed = 1.2): void {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.rig.root.visible = true;
    if (this.dissolve >= 0.99) this.dissolve = 1;
    this.dissolveTarget = 0;
    this.dissolveSpeed = speed;
  }

  /** Appears instantly (jump scares). */
  snapIn(pos: THREE.Vector3, yaw: number): void {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.rig.root.visible = true;
    this.dissolve = 0;
    this.dissolveTarget = 0;
  }

  vanish(speed = 1.5): void {
    this.dissolveTarget = 1;
    this.dissolveSpeed = speed;
  }

  hide(): void {
    this.dissolve = this.dissolveTarget = 1;
    this.rig.root.visible = false;
  }

  play(c: Clip): void {
    this.anim.play(c);
  }

  /** Turns the head toward a world point (limited). */
  lookAt(p: THREE.Vector3 | null): void {
    if (!p) {
      this.anim.lookYaw *= 0.9;
      this.anim.lookPitch *= 0.9;
      return;
    }
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    let d = Math.atan2(dx, dz) - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.anim.lookYaw += (Math.max(-1.2, Math.min(1.2, d)) - this.anim.lookYaw) * 0.1;
    const dy = p.y - (this.pos.y + 1.6);
    this.anim.lookPitch += (-Math.atan2(dy, Math.hypot(dx, dz)) * 0.8 - this.anim.lookPitch) * 0.1;
  }

  update(dt: number, time: number, speed: number, nearPlayer: number): void {
    if (this.dissolve !== this.dissolveTarget) {
      const s = Math.sign(this.dissolveTarget - this.dissolve) * dt * this.dissolveSpeed;
      this.dissolve = Math.abs(this.dissolveTarget - this.dissolve) < Math.abs(s) ? this.dissolveTarget : this.dissolve + s;
      if (this.dissolve >= 1) this.rig.root.visible = false;
    }
    if (!this.rig.root.visible) return;
    this.anim.speed = speed;
    const gait = this.anim.update(dt);
    this.rig.uniforms.uTime.value = time;
    this.rig.uniforms.uDissolve.value = this.dissolve;
    this.rig.uniforms.uSwing.value += (Math.min(1, speed / 3) - this.rig.uniforms.uSwing.value) * Math.min(1, dt * 3);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    if (!this.audible || this.layer) return;
    // Footsteps on gait zero crossings.
    const s = Math.sign(gait);
    if (speed > 0.3 && s !== this.lastStep && s !== 0) {
      this.lastStep = s;
      bus.emit('sfx', {
        name: 'ghostStep',
        pos: this.pos.clone().setY(this.pos.y + 0.1),
        volume: Math.min(1, 0.4 + speed * 0.2),
        rate: 0.85 + Math.random() * 0.3,
      });
    }
    // Raspy breathing when close.
    this.breathT -= dt;
    if (this.breathT <= 0 && nearPlayer < 9) {
      this.breathT = 3 + Math.random() * 3;
      bus.emit('sfx', { name: 'ghostBreath', pos: this.pos.clone().setY(this.pos.y + 1.6), volume: 0.7 });
    }
  }
}
