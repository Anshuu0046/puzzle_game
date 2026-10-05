import * as THREE from 'three';
import type { Box } from './collision';
import { addInteractable, hitProxy, type WorldCtx } from './context';
import { cbox } from './geom';
import { decal, graffiti, label, roomPlate } from './textArt';
import { bus } from '../core/events';
import { state } from '../systems/gameState';

export type LockKind = 'none' | 'key' | 'padlock' | 'sealed' | 'jammed' | 'code' | 'story';

export interface DoorSpec {
  id: string;
  /** World X/Z of the opening's start along the wall, wall axis, width. */
  axis: 'x' | 'z';
  /** Start coordinate along the wall axis and the wall's fixed coordinate (centre). */
  a: number;
  c: number;
  width: number;
  floorY: number;
  wallT: number;
  /** +1: leaf swings toward +normal, -1: toward -normal. */
  swing: 1 | -1;
  /** Hinge at the opening start (false) or end (true) along the axis. */
  hingeAtEnd?: boolean;
  material?: string;
  lock?: LockKind;
  keyId?: string;
  label?: string;
  /** Side (+1/-1 along the normal) that carries the number plate and aldrop latch. */
  plateSide?: 1 | -1;
  height?: number;
  lockedMessage?: string;
  scratched?: boolean;
  sealPaper?: boolean;
  openAtStart?: number;
  /** Never opens: bake into static geometry (keeps collider + interaction proxy). */
  permanent?: boolean;
}

/**
 * Hinged hostel door: wooden leaf with raised panels, chaukhat frame, aldrop latch, optional
 * padlock and seal, painted number plate. Owns its collider and interaction.
 */
export class Door {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly collider: Box;
  readonly openCollider: Box;
  lock: LockKind;
  keyId?: string;
  angle = 0;
  target = 0;
  /** Opening speed in rad/s; ghosts and slams use higher values. */
  speed = 1.6;
  private padlock: THREE.Object3D | null = null;
  private seal: THREE.Object3D | null = null;
  private readonly spec: DoorSpec;
  private readonly openAngle: number;
  private readonly mirror: boolean;
  readonly center = new THREE.Vector3();
  onUnlockAttempt?: () => boolean;
  /** Called when the player interacts with a locked door (story hooks). */
  onLockedInteract?: () => void;
  customPrompt?: () => string | null;

  constructor(ctx: WorldCtx, spec: DoorSpec) {
    this.spec = spec;
    this.id = spec.id;
    this.lock = spec.lock ?? 'none';
    this.keyId = spec.keyId;
    const H = spec.height ?? 2.1;
    const w = spec.width;
    // Local frame: wall along +X from the hinge (0..w), swing side = +Z, floor at y = 0.
    // Built from an explicit basis so any hinge/swing combination maps cleanly to world space.
    const root = this.root;
    const along = new THREE.Vector3();
    const swingDir = new THREE.Vector3();
    const hinge = new THREE.Vector3();
    if (spec.axis === 'x') {
      along.set(spec.hingeAtEnd ? -1 : 1, 0, 0);
      swingDir.set(0, 0, spec.swing);
      hinge.set(spec.hingeAtEnd ? spec.a + w : spec.a, spec.floorY, spec.c);
    } else {
      along.set(0, 0, spec.hingeAtEnd ? -1 : 1);
      swingDir.set(spec.swing, 0, 0);
      hinge.set(spec.c, spec.floorY, spec.hingeAtEnd ? spec.a + w : spec.a);
    }
    root.matrixAutoUpdate = false;
    root.matrix.makeBasis(along, new THREE.Vector3(0, 1, 0), swingDir).setPosition(hinge);
    this.mirror = root.matrix.determinant() < 0;
    this.openAngle = -1.45;
    ctx.scene.add(root);

    const wood = ctx.mats.get(spec.material ?? 'wood_door_brown', 1);
    const T = spec.wallT;
    const ft = 0.055;
    // Frame posts and head.
    root.add(this.m(cbox(ft, H + ft, T + 0.02), wood, ft / 2, (H + ft) / 2, 0));
    root.add(this.m(cbox(ft, H + ft, T + 0.02), wood, w - ft / 2, (H + ft) / 2, 0));
    root.add(this.m(cbox(w, ft, T + 0.02), wood, w / 2, H + ft / 2, 0));
    // Leaf on a pivot at the hinge, flush with the swing-side face.
    const lw = w - ft * 2 - 0.006;
    const lt = 0.038;
    this.pivot.position.set(ft, 0, T / 2 - lt / 2 - 0.005);
    root.add(this.pivot);
    const leaf = new THREE.Group();
    leaf.position.x = lw / 2 + 0.003;
    this.pivot.add(leaf);
    leaf.add(this.m(cbox(lw, H - 0.012, lt), wood, 0, H / 2, 0));
    // Raised panels on both faces (2 tall + 1 short, typical PWD door).
    for (const face of [-1, 1]) {
      for (const [py, ph] of [
        [0.55, 0.75],
        [1.5, 0.9],
      ] as const) {
        leaf.add(this.m(cbox(lw - 0.16, ph, 0.012), wood, 0, py, face * (lt / 2 + 0.004), false));
      }
      leaf.add(this.m(cbox(lw - 0.08, 0.05, 0.008), wood, 0, 1.0, face * (lt / 2 + 0.003), false));
    }
    // Handles both sides + hinges.
    const steel = ctx.mats.getBasic('steel');
    for (const face of [-1, 1]) {
      leaf.add(this.m(cbox(0.03, 0.16, 0.02), steel, lw / 2 - 0.1, 1.0, face * (lt / 2 + 0.02), false));
      leaf.add(this.m(cbox(0.03, 0.02, 0.05), steel, lw / 2 - 0.1, 1.07, face * (lt / 2 + 0.01), false));
    }
    for (const hy of [0.25, 1.05, 1.85]) leaf.add(this.m(cbox(0.02, 0.1, lt + 0.01), steel, -lw / 2, hy, 0, false));
    // Aldrop latch + padlock hasp on the plate side.
    const plateSide = spec.plateSide ?? (spec.swing > 0 ? -1 : 1);
    const ps = plateSide * spec.swing; // plate side in local Z terms (+Z = swing side)
    const brass = ctx.mats.getBasic('brass');
    const latchZ = ps > 0 ? T / 2 + 0.03 : -T / 2 - 0.03;
    leaf.add(this.m(cbox(0.24, 0.025, 0.02), brass, lw / 2 - 0.16, 1.25, ps > 0 ? lt / 2 + 0.012 : -lt / 2 - 0.012, false));
    root.add(this.m(cbox(0.05, 0.08, 0.02), brass, w - ft - 0.02, 1.25, latchZ, false));
    if (this.lock === 'padlock' || this.lock === 'sealed') {
      const pl = new THREE.Group();
      pl.add(this.m(new THREE.BoxGeometry(0.065, 0.075, 0.03), brass, 0, 0, 0, false));
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), steel);
      shackle.position.y = 0.035;
      pl.add(shackle);
      pl.position.set(w - ft - 0.02, 1.18, latchZ + (ps > 0 ? 0.02 : -0.02));
      pl.rotation.z = 0.15;
      pl.userData.anim = true;
      root.add(pl);
      this.padlock = pl;
    }
    if (spec.sealPaper) {
      const seal = new THREE.Group();
      const strip = decal(label('SEALED · BY ORDER · CHIEF WARDEN', 512, 48, '#d9cfa8', '#7a1010', undefined, 22), 1.2, 0.11);
      strip.rotation.z = 0.5;
      seal.add(strip);
      const strip2 = decal(label('DO NOT OPEN · 14-11-2016', 512, 48, '#d9cfa8', '#7a1010', undefined, 22), 1.2, 0.11);
      strip2.rotation.z = -0.45;
      strip2.position.z = 0.002;
      seal.add(strip2);
      seal.position.set(w / 2, 1.2, ps > 0 ? T / 2 + 0.035 : -T / 2 - 0.035);
      if (ps < 0) seal.rotation.y = Math.PI;
      if (this.mirror) seal.scale.x = -1;
      seal.userData.anim = true;
      root.add(seal);
      this.seal = seal;
    }
    if (spec.scratched) {
      const s = decal(graffiti('', 99, undefined, 256, 512, 30), lw * 0.9, 1.6, { transparent: true });
      s.position.set(0, 1.0, ps > 0 ? -lt / 2 - 0.003 : lt / 2 + 0.003);
      if (ps > 0) s.rotation.y = Math.PI;
      leaf.add(s);
    }
    if (spec.label) {
      const plate = decal(roomPlate(spec.label), 0.26, 0.13);
      plate.position.set(w / 2, H + 0.22, ps > 0 ? T / 2 + 0.006 : -T / 2 - 0.006);
      if (ps < 0) plate.rotation.y = Math.PI;
      if (this.mirror) plate.scale.x = -1;
      root.add(plate);
    }
    root.traverse((o) => {
      o.userData.dynamic = true;
    });
    root.userData.rigid = true;
    this.pivot.userData.anim = true;
    this.pivot.userData.rigid = true;

    // Colliders in world space.
    root.updateMatrixWorld(true);
    this.collider = ctx.col.add({ ...this.worldBox(0, w, -T / 2, T / 2, H), tag: 'door' });
    this.openCollider = ctx.col.add({ ...this.worldBox(0, 0.08, T / 2, T / 2 + lw, H), tag: 'door', enabled: false, opaque: false });
    this.center.set(w / 2, 1.2, 0).applyMatrix4(root.matrixWorld);

    // Interaction proxies on both faces.
    const proxy = hitProxy(w, H, T + 0.3);
    proxy.position.set(w / 2, H / 2, 0);
    root.add(proxy);
    addInteractable(ctx, {
      id: `door:${this.id}`,
      target: proxy,
      position: this.center.clone(),
      prompt: () => this.prompt(),
      onInteract: () => this.interact(),
    });
    if (spec.permanent) {
      // Bake everything except the hit proxy into the static batch.
      proxy.removeFromParent();
      root.traverse((o) => (o.userData.dynamic = false));
      root.updateMatrixWorld(true);
      ctx.batch.addObject(root);
      root.clear();
      root.add(proxy);
      proxy.userData.dynamic = true;
      root.userData.rigid = false;
      root.updateMatrixWorld(true);
    }
    if (spec.openAtStart) {
      this.angle = this.target = spec.openAtStart * this.openAngle;
      this.pivot.rotation.y = this.angle;
      this.updateColliders();
    }
  }

  private m(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
    const me = new THREE.Mesh(g, mat);
    me.position.set(x, y, z);
    me.castShadow = cast;
    me.receiveShadow = true;
    return me;
  }

  private worldBox(x0: number, x1: number, z0: number, z1: number, h: number) {
    const pts = [
      new THREE.Vector3(x0, 0, z0),
      new THREE.Vector3(x1, 0, z0),
      new THREE.Vector3(x0, 0, z1),
      new THREE.Vector3(x1, 0, z1),
    ].map((p) => p.applyMatrix4(this.root.matrixWorld));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      minY: this.spec.floorY,
      maxY: this.spec.floorY + h,
    };
  }

  get isOpen(): boolean {
    return this.target !== 0;
  }

  get locked(): boolean {
    return this.lock !== 'none';
  }

  prompt(): string | null {
    if (this.customPrompt) {
      const p = this.customPrompt();
      if (p !== undefined) return p;
    }
    if (Math.abs(this.angle - this.target) > 0.05) return null;
    if (this.locked) {
      if (this.lock === 'key' && this.keyId && state.has(this.keyId)) return 'unlock';
      if ((this.lock === 'padlock' || this.lock === 'sealed') && this.keyId && state.has(this.keyId)) return 'unlock';
      return 'locked';
    }
    return this.isOpen ? 'close' : 'open';
  }

  interact(): void {
    if (this.locked) {
      if ((this.lock === 'key' || this.lock === 'padlock' || this.lock === 'sealed') && this.keyId && state.has(this.keyId)) {
        this.unlock();
        bus.emit('sfx', { name: 'unlock', pos: this.center });
        return;
      }
      bus.emit('sfx', { name: 'doorRattle', pos: this.center });
      bus.emit('noise', { pos: this.center, loudness: 0.35, kind: 'door' });
      if (this.onLockedInteract) this.onLockedInteract();
      else bus.emit('toast', { text: this.spec.lockedMessage ?? 'msg.locked' });
      return;
    }
    this.setOpen(!this.isOpen);
  }

  unlock(): void {
    this.lock = 'none';
    if (this.padlock) {
      this.padlock.removeFromParent();
      this.padlock = null;
    }
    if (this.seal) {
      this.seal.removeFromParent();
      this.seal = null;
    }
  }

  setLocked(kind: LockKind): void {
    this.lock = kind;
  }

  setOpen(open: boolean, speed = 1.6, silent = false): void {
    const t = open ? this.openAngle : 0;
    if (t === this.target) return;
    this.target = t;
    this.speed = speed;
    if (!silent) {
      bus.emit('sfx', { name: speed > 3 ? 'doorSlam' : open ? 'doorOpen' : 'doorClose', pos: this.center, volume: speed > 3 ? 1 : 0.8 });
      bus.emit('noise', { pos: this.center, loudness: speed > 3 ? 0.9 : 0.4, kind: 'door' });
      if (open) bus.emit('doorOpened', { id: this.id });
    }
    this.collider.enabled = false;
    this.openCollider.enabled = false;
  }

  /** Snaps to state without animation (save restore). */
  snap(open: boolean): void {
    this.target = this.angle = open ? this.openAngle : 0;
    this.pivot.rotation.y = this.angle;
    this.updateColliders();
  }

  private updateColliders(): void {
    const closed = this.angle === 0;
    const open = this.angle === this.openAngle;
    this.collider.enabled = closed;
    this.collider.opaque = true;
    this.openCollider.enabled = open;
  }

  update(dt: number): void {
    if (this.angle === this.target) return;
    const d = this.target - this.angle;
    const step = this.speed * dt * (0.4 + Math.min(1, Math.abs(d)) * 0.8);
    if (Math.abs(d) <= step) {
      this.angle = this.target;
      if (this.target === 0 && this.speed <= 3) bus.emit('sfx', { name: 'doorLatch', pos: this.center, volume: 0.6 });
      this.updateColliders();
    } else this.angle += Math.sign(d) * step;
    this.pivot.rotation.y = this.angle;
  }
}
