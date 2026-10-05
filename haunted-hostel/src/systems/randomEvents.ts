import * as THREE from 'three';
import type { Game } from '../game/game';
import { bus } from '../core/events';
import { state } from './gameState';
import { t } from '../core/i18n';

interface EventDef {
  id: string;
  minChapter: number;
  cooldown: number;
  weight: number;
  /** Returns false if the event can't run right now. */
  run: (g: Game) => boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A point roughly `dist` metres from the player, behind or beside them, on the same floor. */
function offscreenPoint(g: Game, dist: number): THREE.Vector3 {
  const p = g.player.pos;
  const back = g.player.yaw + Math.PI + rand(-1.2, 1.2);
  return new THREE.Vector3(p.x - Math.sin(back) * dist, p.y + 1.2, p.z - Math.cos(back) * dist);
}

const EVENTS: EventDef[] = [
  {
    id: 'flicker',
    minChapter: 1,
    cooldown: 30,
    weight: 3,
    run: (g) => {
      g.lighting.surgeFlicker(rand(0.4, 1.2));
      bus.emit('sfx', { name: 'sparks', pos: g.engine.camera.position.clone().add(new THREE.Vector3(0, 1.4, 0)), volume: 0.3 });
      return true;
    },
  },
  {
    id: 'footsteps',
    minChapter: 1,
    cooldown: 45,
    weight: 2,
    run: (g) => {
      // Footsteps on the floor above (or below on the top floor).
      const up = g.player.floor < 2 ? 3.4 : -3.4;
      const base = g.player.pos.clone().add(new THREE.Vector3(rand(-6, 6), up + 0.2, rand(-1, 1)));
      for (let i = 0; i < 6; i++)
        setTimeout(
          () => bus.emit('sfx', { name: 'ghostStep', pos: base.clone().add(new THREE.Vector3(i * 0.6, 0, 0)), volume: 0.9 }),
          i * 520,
        );
      return true;
    },
  },
  {
    id: 'doorCreak',
    minChapter: 2,
    cooldown: 70,
    weight: 2,
    run: (g) => {
      const cam = g.engine.camera;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      const cands = [...g.world.doors.values()].filter((d) => {
        if (d.locked || d.isOpen) return false;
        const to = d.center.clone().sub(cam.position);
        const dist = to.length();
        return dist > 5 && dist < 14 && Math.abs(d.center.y - cam.position.y) < 2 && to.normalize().dot(fwd) < 0.3;
      });
      const d = cands[Math.floor(Math.random() * cands.length)];
      if (!d) return false;
      d.setOpen(true, 0.5, true);
      bus.emit('sfx', { name: 'creakLong', pos: d.center, volume: 0.9 });
      return true;
    },
  },
  {
    id: 'objectFall',
    minChapter: 1,
    cooldown: 80,
    weight: 1.5,
    run: (g) => {
      bus.emit('sfx', { name: 'objectFall', pos: offscreenPoint(g, rand(6, 10)), volume: 0.9 });
      bus.emit('noise', { pos: g.player.pos.clone(), loudness: 0, kind: 'event' });
      return true;
    },
  },
  {
    id: 'whisper',
    minChapter: 3,
    cooldown: 55,
    weight: 2,
    run: (g) => {
      bus.emit('sfx', { name: `whisper${Math.floor(Math.random() * 4)}`, pos: offscreenPoint(g, 1.6), volume: 0.6 });
      return true;
    },
  },
  {
    id: 'knock',
    minChapter: 2,
    cooldown: 60,
    weight: 1.5,
    run: (g) => {
      const p = offscreenPoint(g, rand(3, 6));
      for (let i = 0; i < 3; i++) setTimeout(() => bus.emit('sfx', { name: 'knock', pos: p, volume: 0.8 }), i * 330);
      return true;
    },
  },
  {
    id: 'fanStop',
    minChapter: 1,
    cooldown: 90,
    weight: 1,
    run: (g) => {
      let hit = false;
      g.engine.scene.traverse((o) => {
        if (hit || o.userData.stopUntil === undefined) return;
        if (o.position.distanceTo(g.player.pos) < 8) {
          o.userData.stopUntil = g.time + rand(8, 20);
          hit = true;
        }
      });
      return hit;
    },
  },
  {
    id: 'glass',
    minChapter: 3,
    cooldown: 240,
    weight: 0.6,
    run: (g) => {
      bus.emit('sfx', { name: 'glassBreak', pos: offscreenPoint(g, rand(8, 12)), volume: 0.8 });
      return true;
    },
  },
  {
    id: 'phone',
    minChapter: 2,
    cooldown: 150,
    weight: 1,
    run: (g) => {
      const pool =
        state.chapter >= 3
          ? ['why did you come back', 'its so dark', 'can you hear the alarm', 'two zero seven']
          : ['bro reached?', 'warden is not picking up', 'call me if anything'];
      const from = state.chapter >= 3 ? t('phone.unknown') : 'Sam';
      g.phone.receive(from, pool[Math.floor(Math.random() * pool.length)]!);
      return true;
    },
  },
  {
    id: 'silhouette',
    minChapter: 3,
    cooldown: 100,
    weight: 1.2,
    run: (g) => {
      if (g.ai.active || g.apparitions.busy || g.player.outdoors) return false;
      // At the far end of the corridor, if the player is looking down it.
      const p = g.player.pos;
      if (Math.abs(p.z) > 1.2) return false;
      const dir = -Math.sin(g.player.yaw);
      const x = p.x + Math.sign(dir) * rand(14, 20);
      if (x < 1 || x > 38.6) return false;
      g.apparitions.show(
        { pos: new THREE.Vector3(x, Math.round(p.y / 3.4) * 3.4, 0), yaw: null, vanishOnLook: true, duration: 6, clip: 'standStill' },
        g.engine.camera,
      );
      return true;
    },
  },
];

/**
 * Lightweight ambient event director: occasionally fires one subtle event, with a per-event
 * cooldown and a global minimum gap so it never spams. Suppressed during chases and while hiding.
 */
export class RandomEvents {
  private readonly last = new Map<string, number>();
  private gap = 20;
  private time = 0;

  constructor(private readonly g: Game) {}

  update(dt: number): void {
    this.time += dt;
    this.gap -= dt;
    if (this.gap > 0) return;
    const g = this.g;
    if (g.ai.hunting || g.hiding.spot || g.story.scripted) {
      this.gap = 5;
      return;
    }
    const pool = EVENTS.filter((e) => state.chapter >= e.minChapter && this.time - (this.last.get(e.id) ?? -999) > e.cooldown);
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        if (e.run(g)) {
          this.last.set(e.id, this.time);
          this.gap = rand(16, 32) * (state.chapter >= 4 ? 0.8 : 1);
        } else this.gap = 3;
        return;
      }
    }
    this.gap = 10;
  }
}
