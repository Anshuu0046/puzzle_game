import * as THREE from 'three';
import type { Fixture } from '../world/context';
import { power } from './power';

interface FixtureRuntime {
  /** Seconds left in the current flicker burst. */
  burst: number;
  /** Seconds until the next random flicker check. */
  nextCheck: number;
  /** Tube start-up sequence time (blink-blink-on when power returns). */
  startup: number;
  startupDelay: number;
  phase: number;
  dead: boolean;
}

/**
 * Drives every light fixture: circuits, start-up blinking, random failing tubes and scripted
 * overrides. A fixed pool of real PointLights is assigned each frame to the most relevant
 * fixtures near the camera, so the shader light count never changes (no recompiles) and mobile
 * GPUs only ever shade a handful of lights.
 */
export class LightingSystem {
  private readonly pool: THREE.PointLight[] = [];
  private readonly rt = new Map<Fixture, FixtureRuntime>();
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  private time = 0;
  /** Global multiplier for scripted mass flickers (0..1). */
  globalDim = 1;
  private surge = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly fixtures: Fixture[],
    poolSize: number,
  ) {
    for (let i = 0; i < poolSize; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 2);
      l.castShadow = false;
      scene.add(l);
      this.pool.push(l);
    }
    // Faint fill so nothing is ever pure black: cold moonlight from above, warm bounce from below.
    this.hemi = new THREE.HemisphereLight(0x3a4a66, 0x1a140c, 0.32);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x1a2030, 0.18);
    scene.add(this.ambient);
    for (const f of fixtures) {
      this.rt.set(f, { burst: 0, nextCheck: Math.random() * 6, startup: 99, startupDelay: 0, phase: Math.random() * 100, dead: false });
    }
    power.subscribe((c, on) => {
      if (!on) return;
      for (const f of this.fixtures) {
        if (f.circuit !== c) continue;
        const r = this.rt.get(f)!;
        r.startup = 0;
        r.startupDelay = Math.random() * 1.6;
      }
    });
  }

  setPoolSize(n: number): void {
    while (this.pool.length > n) this.scene.remove(this.pool.pop()!);
    while (this.pool.length < n) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 2);
      this.scene.add(l);
      this.pool.push(l);
    }
  }

  /** Brief brown-out across everything (used by scares). */
  surgeFlicker(seconds: number): void {
    this.surge = Math.max(this.surge, seconds);
  }

  kill(id: string): void {
    const f = this.fixtures.find((x) => x.id === id);
    if (f) this.rt.get(f)!.dead = true;
  }

  get(id: string): Fixture | undefined {
    return this.fixtures.find((x) => x.id === id);
  }

  private levelOf(f: Fixture, dt: number): number {
    const r = this.rt.get(f)!;
    if (f.forced !== null) return f.forced;
    if (r.dead) return 0;
    if (!power.on(f.circuit)) return 0;
    let level = 1;
    // Tube start-up: a few blinks before settling.
    if (r.startup < 3) {
      r.startup += dt;
      const t = r.startup - r.startupDelay;
      if (t < 0) return 0;
      if (t < 0.9) {
        const blink = Math.sin(t * 38 + r.phase) > 0.4 ? 0.9 : 0.05;
        return f.buzz ? blink : Math.min(1, t * 3);
      }
    }
    // Random failing behaviour.
    r.nextCheck -= dt;
    if (r.nextCheck <= 0) {
      r.nextCheck = 2 + Math.random() * 8;
      if (Math.random() < f.unstable) r.burst = 0.15 + Math.random() * (0.4 + f.unstable * 1.6);
    }
    if (r.burst > 0) {
      r.burst -= dt;
      const n = Math.sin(this.time * 61 + r.phase) * Math.sin(this.time * 23.3 + r.phase * 2);
      level = n > 0.1 ? 1 : n > -0.4 ? 0.35 : 0.02;
    } else if (f.unstable > 0.5) {
      // Chronically sick tubes hum at a slightly lower, wavering output.
      level = 0.75 + Math.sin(this.time * 7.1 + r.phase) * 0.08;
    }
    if (this.surge > 0) level *= Math.random() < 0.5 ? 0.1 : 0.8;
    return level * this.globalDim;
  }

  update(dt: number, camera: THREE.Camera, cameraFloor: number): void {
    this.time += dt;
    if (this.surge > 0) this.surge -= dt;
    for (const f of this.fixtures) {
      const lv = this.levelOf(f, dt);
      f.level = lv;
      for (const m of f.mats) m.emissiveIntensity = f.emissiveBase * lv;
      if (f.glow) (f.glow.material as THREE.SpriteMaterial).opacity = ((f.glow.userData.baseOpacity as number) ?? 0.3) * lv;
    }
    // Pick the best fixtures for the real light pool.
    camera.getWorldPosition(this.tmp);
    camera.getWorldDirection(this.fwd);
    const scored: { f: Fixture; s: number }[] = [];
    for (const f of this.fixtures) {
      if (f.level <= 0.01) continue;
      const dx = f.pos.x - this.tmp.x;
      const dy = f.pos.y - this.tmp.y;
      const dz = f.pos.z - this.tmp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 26 * 26) continue;
      const floorPenalty = Math.abs(f.floor - cameraFloor) > 0 && f.circuit !== 'EXT' && f.circuit !== 'STREET' ? 0.15 : 1;
      const d = Math.sqrt(d2) + 0.001;
      const facing = (dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z) / d;
      const s = ((f.intensity * f.level) / (d2 + 4)) * floorPenalty * (facing > -0.2 ? 1 : 0.45);
      scored.push({ f, s });
    }
    scored.sort((a, b) => b.s - a.s);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i]!;
      const e = scored[i];
      if (!e) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(e.f.pos);
      l.color.copy(e.f.color);
      l.distance = e.f.range;
      l.intensity = e.f.intensity * e.f.level;
    }
  }
}
