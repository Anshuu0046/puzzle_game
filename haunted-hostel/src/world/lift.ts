import * as THREE from 'three';
import type { Box } from './collision';
import type { Fixture, WorldCtx } from './context';
import { markDynamic } from './context';
import { at, cbox, rod } from './geom';
import { CORR, CWALL, LIFT, ROOF_Y, floorY } from './layout';
import { DynamicLabel, decal, label } from './textArt';
import { interactive } from './actions';
import { registerFixture } from './props/fixtures';
import { bus } from '../core/events';
import { power } from '../systems/power';

export type LiftStop = 'G' | '1' | '2' | '3';
const STOP_Y: Record<LiftStop, number> = { G: floorY(0), '1': floorY(1), '2': floorY(2), '3': ROOF_Y };

interface Landing {
  stop: LiftStop;
  left: THREE.Object3D;
  right: THREE.Object3D;
  collider: Box;
  open: number;
  display: DynamicLabel;
}

/**
 * Old passenger lift: a steel car with a collapsible grille that physically travels up the shaft,
 * sliding landing doors on every floor, floor indicators, and a scripted "floor 3" stop that the
 * building does not officially have.
 */
export class Lift {
  readonly car = new THREE.Group();
  y = 0;
  current: LiftStop = 'G';
  private target: LiftStop | null = null;
  private queue: LiftStop[] = [];
  state: 'idle' | 'opening' | 'open' | 'closing' | 'moving' | 'waiting' = 'idle';
  private timer = 0;
  private readonly landings: Landing[] = [];
  private readonly carColliders: Box[] = [];
  private readonly grilleCollider: Box;
  private readonly grille: THREE.Group;
  private grilleOpen = 1;
  private readonly carDisplay: DynamicLabel;
  private readonly light: Fixture;
  private readonly lightLocal = new THREE.Vector3(1.65, 2.3, 2.5);
  /** Seconds the doors stay open at the next stop (scripted stops use longer). */
  dwell = 6;
  /** Hook for the story: called when the car arrives at a stop. */
  onArrive?: (stop: LiftStop) => void;
  /** Hook to divert a trip (first ride stops at "3"). */
  divert?: (from: LiftStop, to: LiftStop) => LiftStop[] | null;
  hiddenThird = true;
  broken = false;
  /** Story override: the lift runs during the blackout (she wants you to take it). */
  forcePower = false;
  /** Keep the car's grille shut at the next stop (the doors open on bricks). */
  grilleLocked = false;
  speed = 0.75;

  constructor(private readonly ctx: WorldCtx) {
    const steel = ctx.mats.get('metal_almirah', 1);
    const W = LIFT.x1 - LIFT.x0 - 0.1;
    const D = LIFT.z1 - LIFT.z0 - 0.1;
    const cx = (LIFT.x0 + LIFT.x1) / 2;
    const cz = (LIFT.z0 + LIFT.z1) / 2;
    const car = this.car;
    // Chequered steel floor plate.
    car.add(at(new THREE.Mesh(cbox(W, 0.08, D), ctx.mats.get('metal_black', 0.4)), 0, -0.04, 0));
    // Walls (back + sides), ceiling.
    car.add(at(new THREE.Mesh(cbox(W, 2.4, 0.04), steel), 0, 1.2, D / 2));
    car.add(at(new THREE.Mesh(cbox(0.04, 2.4, D), steel), -W / 2, 1.2, 0));
    car.add(at(new THREE.Mesh(cbox(0.04, 2.4, D), steel), W / 2, 1.2, 0));
    car.add(at(new THREE.Mesh(cbox(W, 0.06, D), steel), 0, 2.42, 0));
    // Handrail and a cracked mirror strip on the back wall.
    car.add(
      new THREE.Mesh(
        rod(new THREE.Vector3(-W / 2 + 0.1, 0.95, D / 2 - 0.06), new THREE.Vector3(W / 2 - 0.1, 0.95, D / 2 - 0.06), 0.018),
        ctx.mats.getBasic('chrome'),
      ),
    );
    car.add(at(new THREE.Mesh(cbox(W - 0.4, 1.0, 0.01), ctx.mats.getBasic('mirror_back')), 0, 1.6, D / 2 - 0.025));
    // Ceiling light panel.
    const lm = ctx.mats.emissive(0xe8f0ff, 1.8);
    car.add(at(new THREE.Mesh(cbox(0.6, 0.02, 0.3), lm), 0, 2.38, 0));
    // Button panel on the right wall.
    const panel = new THREE.Group();
    panel.add(new THREE.Mesh(cbox(0.02, 0.5, 0.18), ctx.mats.getBasic('chrome')));
    const labels: LiftStop[] = ['G', '1', '2', '3'];
    labels.forEach((l, i) => {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12),
        ctx.mats.emissive(l === '3' ? 0x000000 : 0xff8a3a, 0.4),
      );
      b.rotation.z = Math.PI / 2;
      b.position.set(-0.012, -0.15 + i * 0.09, 0);
      b.name = `btn${l}`;
      b.visible = l !== '3';
      panel.add(b);
      const t = decal(label(l, 64, 64, '#111', '#ddd'), 0.025, 0.025);
      t.position.set(-0.012, -0.15 + i * 0.09, 0.04);
      t.rotation.y = -Math.PI / 2;
      t.visible = l !== '3';
      t.name = `lbl${l}`;
      panel.add(t);
    });
    panel.position.set(W / 2 - 0.03, 1.2, -D / 2 + 0.25);
    car.add(panel);
    this.carDisplay = new DynamicLabel(128, 64);
    this.carDisplay.set('G');
    const disp = decal(this.carDisplay.texture, 0.18, 0.09, { emissive: true });
    disp.position.set(0, 2.25, -D / 2 + 0.03);
    car.add(disp);
    // Collapsible grille on the car front.
    this.grille = new THREE.Group();
    const iron = ctx.mats.get('metal_black', 1);
    for (let i = 0; i <= 10; i++) {
      const bar = new THREE.Mesh(cbox(0.02, 2.3, 0.02), iron);
      bar.position.set((i / 10) * (W - 0.1), 1.15, 0);
      this.grille.add(bar);
    }
    for (let i = 0; i < 10; i++)
      for (const y of [0.5, 1.2, 1.9]) {
        this.grille.add(
          new THREE.Mesh(
            rod(new THREE.Vector3((i / 10) * (W - 0.1), y - 0.25, 0), new THREE.Vector3(((i + 1) / 10) * (W - 0.1), y + 0.25, 0), 0.006, 4),
            iron,
          ),
        );
      }
    this.grille.position.set(-W / 2 + 0.05, 0, -D / 2 + 0.03);
    car.add(this.grille);
    car.position.set(cx, 0, cz);
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    markDynamic(car);
    ctx.scene.add(car);
    // Car colliders (moved every frame).
    const mk = (minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number) =>
      ctx.col.add({ minX: cx + minX, maxX: cx + maxX, minZ: cz + minZ, maxZ: cz + maxZ, minY, maxY, tag: 'lift', opaque: true });
    this.carColliders.push(mk(-W / 2, W / 2, -D / 2, D / 2, -0.3, 0));
    this.carColliders.push(mk(-W / 2, W / 2, D / 2 - 0.03, D / 2 + 0.05, 0, 2.45));
    this.carColliders.push(mk(-W / 2 - 0.05, -W / 2 + 0.03, -D / 2, D / 2, 0, 2.45));
    this.carColliders.push(mk(W / 2 - 0.03, W / 2 + 0.05, -D / 2, D / 2, 0, 2.45));
    this.carColliders.push(mk(-W / 2, W / 2, -D / 2, D / 2, 2.42, 2.6));
    this.grilleCollider = ctx.col.add({
      minX: cx - W / 2,
      maxX: cx + W / 2,
      minZ: cz - D / 2 - 0.02,
      maxZ: cz - D / 2 + 0.05,
      minY: 0,
      maxY: 2.4,
      tag: 'lift',
      opaque: false,
      enabled: false,
    });
    this.light = registerFixture(ctx, {
      id: 'liftCar',
      pos: new THREE.Vector3(),
      color: 0xe8f0ff,
      intensity: 4,
      range: 4,
      circuit: 'GF',
      mats: [lm],
      emissiveBase: 1.8,
      unstable: 0.3,
      floor: 0,
      buzz: true,
    });

    // Landing doors + call buttons + indicators.
    for (const stop of ['G', '1', '2', '3'] as LiftStop[]) {
      const L = STOP_Y[stop];
      const z = CORR + CWALL / 2;
      const half = (LIFT.doorX1 - LIFT.doorX0) / 2;
      const mkPanel = () => {
        const p = new THREE.Group();
        p.add(new THREE.Mesh(cbox(half, 2.1, 0.04), ctx.mats.get(stop === '3' ? 'rust' : 'metal_almirah', 1)));
        p.children[0]!.position.y = 1.05;
        p.add(at(new THREE.Mesh(cbox(0.06, 0.4, 0.012), ctx.mats.getBasic('glass_dirty')), 0, 1.5, -0.025));
        return p;
      };
      const left = mkPanel();
      const right = mkPanel();
      left.position.set(LIFT.doorX0 + half / 2, L, z);
      right.position.set(LIFT.doorX1 - half / 2, L, z);
      markDynamic(left);
      markDynamic(right);
      ctx.scene.add(left, right);
      const collider = ctx.col.add({
        minX: LIFT.doorX0,
        maxX: LIFT.doorX1,
        minZ: z - 0.05,
        maxZ: z + 0.05,
        minY: L,
        maxY: L + 2.1,
        tag: 'liftdoor',
      });
      const display = new DynamicLabel(128, 64);
      display.set('G');
      const disp = decal(display.texture, 0.16, 0.08, { emissive: true });
      disp.position.set((LIFT.doorX0 + LIFT.doorX1) / 2, L + 2.35, CORR - 0.01);
      disp.rotation.y = Math.PI;
      ctx.scene.add(disp);
      this.landings.push({ stop, left, right, collider, open: 0, display });
      if (stop !== '3') {
        const btn = new THREE.Group();
        btn.add(new THREE.Mesh(cbox(0.08, 0.14, 0.02), ctx.mats.getBasic('chrome')));
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), ctx.mats.emissive(0xff6a2a, 0.5));
        b.rotation.x = Math.PI / 2;
        b.position.z = -0.012;
        btn.add(b);
        btn.position.set(LIFT.doorX1 + 0.25, L + 1.15, CORR - 0.012);
        markDynamic(btn);
        ctx.scene.add(btn);
        interactive(ctx, `liftCall${stop}`, btn, [0.25, 0.3, 0.2], { prompt: 'callLift' }, [0, 0, 0]);
      }
    }
    // The car's interior panel interaction.
    interactive(ctx, 'liftPanel', panel, [0.15, 0.6, 0.35], { prompt: 'liftPanel' }, [0, 0, 0]);
    this.setY(0);
    this.updateDisplays();
  }

  private setY(y: number): void {
    const dy = y - this.y;
    this.y = y;
    this.car.position.y = y;
    for (const c of this.carColliders) {
      c.minY += dy;
      c.maxY += dy;
      this.ctx.col.update(c);
    }
    this.grilleCollider.minY = y;
    this.grilleCollider.maxY = y + 2.4;
    this.ctx.col.update(this.grilleCollider);
    this.light.pos.copy(this.lightLocal).setY(y + 2.3);
    this.light.floor = Math.round(y / 3.4);
  }

  get powered(): boolean {
    return (power.on('GF') || this.forcePower) && !this.broken;
  }

  /** True when the player is standing inside the car. */
  contains(p: THREE.Vector3): boolean {
    return p.x > LIFT.x0 && p.x < LIFT.x1 && p.z > LIFT.z0 && p.z < LIFT.z1 && Math.abs(p.y - this.y) < 1.2;
  }

  stopFromFloor(y: number): LiftStop {
    return y > 9 ? '3' : y > 5 ? '2' : y > 2 ? '1' : 'G';
  }

  call(stop: LiftStop): boolean {
    if (!this.powered) return false;
    if (stop === '1') return false;
    if (this.state === 'moving' || this.queue.length) return true;
    if (this.current === stop) {
      this.openDoors();
      return true;
    }
    this.go(stop);
    return true;
  }

  /** Requests a trip from inside the car. */
  go(stop: LiftStop): void {
    if (!this.powered) return;
    if (stop === this.current && this.state !== 'moving') {
      this.openDoors();
      return;
    }
    const route = this.divert?.(this.current, stop) ?? [stop];
    this.queue = route;
    this.closeDoorsThen();
  }

  private closeDoorsThen(): void {
    this.state = 'closing';
    bus.emit('sfx', { name: 'liftDoor', pos: this.car.position.clone().setY(this.y + 1.2) });
  }

  openDoors(): void {
    this.state = 'opening';
    bus.emit('sfx', { name: 'liftDoor', pos: this.car.position.clone().setY(this.y + 1.2) });
  }

  isAt(stop: LiftStop): boolean {
    return this.current === stop && this.state !== 'moving';
  }

  revealThird(): void {
    this.hiddenThird = false;
    this.car.traverse((o) => {
      if (o.name === 'btn3' || o.name === 'lbl3') o.visible = true;
    });
  }

  private landing(stop: LiftStop): Landing | undefined {
    return this.landings.find((l) => l.stop === stop);
  }

  private updateDisplays(): void {
    const s =
      this.state === 'moving'
        ? this.target && STOP_Y[this.target] > this.y
          ? `${this.stopFromFloor(this.y + 0.5)}▲`
          : `${this.stopFromFloor(this.y + 2.9)}▼`
        : this.current;
    const text = this.powered ? s : '';
    this.carDisplay.set(text);
    for (const l of this.landings) l.display.set(text);
  }

  private dispTimer = 0;

  update(dt: number): void {
    const land = this.landing(this.current);
    this.dispTimer -= dt;
    if (this.dispTimer <= 0) {
      this.dispTimer = 0.25;
      this.updateDisplays();
    }
    switch (this.state) {
      case 'opening': {
        if (!land) break;
        land.open = Math.min(1, land.open + dt * 1.1);
        this.grilleOpen = this.grilleLocked ? 0 : land.open;
        if (land.open >= 1) {
          this.state = 'open';
          this.timer = this.dwell;
          this.dwell = 6;
        }
        break;
      }
      case 'open':
        this.timer -= dt;
        if (this.timer <= 0 && this.queue.length) {
          this.grilleLocked = false;
          this.closeDoorsThen();
        }
        break;
      case 'closing': {
        if (land) land.open = Math.max(0, land.open - dt * 1.1);
        this.grilleOpen = land ? land.open : 0;
        if (!land || land.open <= 0) {
          const next = this.queue.shift();
          if (next && next !== this.current) {
            this.target = next;
            this.state = 'moving';
            bus.emit('sfx', { name: 'liftStart', pos: this.car.position.clone().setY(this.y + 1.2) });
          } else this.state = 'idle';
        }
        break;
      }
      case 'moving': {
        if (!this.target) break;
        const ty = STOP_Y[this.target];
        const d = ty - this.y;
        const step = Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
        this.setY(this.y + step);
        if (Math.abs(ty - this.y) < 1e-3) {
          this.setY(ty);
          this.current = this.target;
          this.target = null;
          this.state = 'waiting';
          this.timer = 0.6;
          bus.emit('sfx', { name: 'liftDing', pos: this.car.position.clone().setY(this.y + 1.2) });
          this.onArrive?.(this.current);
        }
        break;
      }
      case 'waiting':
        this.timer -= dt;
        if (this.timer <= 0) this.openDoors();
        break;
      default:
        break;
    }
    for (const l of this.landings) {
      const half = (LIFT.doorX1 - LIFT.doorX0) / 2;
      l.left.position.x = LIFT.doorX0 + half / 2 - l.open * (half - 0.04);
      l.right.position.x = LIFT.doorX1 - half / 2 + l.open * (half - 0.04);
      l.collider.enabled = l.open < 0.8;
    }
    this.grille.scale.x = 1 - this.grilleOpen * 0.88;
    this.grilleCollider.enabled = this.grilleOpen < 0.8;
  }

  /** For saves and debug: move the car instantly. */
  snap(stop: LiftStop): void {
    this.queue = [];
    this.target = null;
    for (const l of this.landings) l.open = 0;
    this.current = stop;
    this.setY(STOP_Y[stop]);
    this.state = 'idle';
    this.grilleOpen = 0;
  }
}
