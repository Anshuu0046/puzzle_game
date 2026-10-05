import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { HideSpot } from '../world/context';
import type { Door } from '../world/doors';
import type { GhostBody } from './ghost';
import { NavGraph, type NavNode } from './nav';
import { bus } from '../core/events';

export type AIState = 'DORMANT' | 'IDLE' | 'PATROL' | 'INVESTIGATE' | 'SEARCH' | 'CHASE' | 'ATTACK' | 'RETREAT' | 'INSPECT';

export interface PlayerView {
  pos: THREE.Vector3;
  eye: THREE.Vector3;
  floor: number;
  hidden: HideSpot | null;
  seenHiding: boolean;
  holdingBreath: boolean;
  crouching: boolean;
  flashlightOn: boolean;
  /** Room id the player is in (for safe rooms). */
  room: string | null;
}

export interface AIHooks {
  onCaught: () => void;
  onChaseStart: () => void;
  onChaseEnd: () => void;
  doors: Map<string, Door>;
  safeRooms: Set<string>;
}

/**
 * Hunting AI. She patrols the waypoint graph, hears footsteps/doors/voices, sees the player in a
 * view cone (further when the flashlight is on), investigates, chases with line of sight, searches
 * where she lost you, inspects hiding spots she saw you enter, and retreats — fading out and
 * re-appearing somewhere else — instead of teleporting behind the player.
 */
export class GhostAI {
  state: AIState = 'DORMANT';
  private path: number[] = [];
  private pathIdx = 0;
  private stateT = 0;
  readonly lastKnown = new THREE.Vector3();
  awareness = 0;
  private lostT = 0;
  private searchLeft = 0;
  private inspecting: HideSpot | null = null;
  private respawnT = 0;
  /** 0 = gentle (chapter 4 patrols) … 1 = relentless (chapter 5). */
  aggression = 0.5;
  /** Floors she may roam (story-controlled). */
  allowedFloors = new Set([0, 2]);
  private time = 0;
  private chaseTime = 0;
  private stuckT = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  /** Debug: last decision for the overlay. */
  debug = '';

  constructor(
    readonly body: GhostBody,
    private readonly nav: NavGraph,
    private readonly col: CollisionWorld,
    private readonly hooks: AIHooks,
  ) {
    bus.on('noise', (n) => this.hear(n.pos, n.loudness, n.kind));
  }

  get active(): boolean {
    return this.state !== 'DORMANT';
  }

  get hunting(): boolean {
    return this.state === 'CHASE' || this.state === 'ATTACK' || this.state === 'INSPECT';
  }

  /** Starts roaming from a node far from the player. */
  activate(player: THREE.Vector3, aggression: number): void {
    this.aggression = aggression;
    if (this.state !== 'DORMANT') return;
    this.respawnFar(player, 14);
    this.setState('PATROL');
  }

  deactivate(): void {
    this.body.vanish(1);
    this.setState('DORMANT');
  }

  private setState(s: AIState): void {
    if (s === this.state) return;
    const was = this.state;
    this.state = s;
    this.stateT = 0;
    if (s === 'CHASE') {
      this.chaseTime = 0;
      this.hooks.onChaseStart();
    }
    if (was === 'CHASE' && s !== 'ATTACK' && s !== 'INSPECT') this.hooks.onChaseEnd();
  }

  private hear(pos: THREE.Vector3, loudness: number, kind: string): void {
    if (!this.active || this.state === 'CHASE' || this.state === 'ATTACK' || this.state === 'RETREAT' || this.state === 'INSPECT') return;
    const d = this.body.pos.distanceTo(pos);
    const floorDiff = Math.abs(Math.round(pos.y / 3.4) - Math.round(this.body.pos.y / 3.4));
    const radius = (loudness * 26 * (0.6 + this.aggression * 0.6)) / (1 + floorDiff * 2.5);
    if (d > radius) return;
    // Walls muffle sound.
    const blocked = this.col.segmentBlocked(this.body.pos.x, this.body.pos.y + 1.5, this.body.pos.z, pos.x, pos.y + 1.0, pos.z);
    if (blocked && d > radius * 0.55) return;
    this.lastKnown.copy(pos);
    this.debug = `heard ${kind}`;
    this.goTo(pos);
    this.setState('INVESTIGATE');
  }

  private goTo(p: THREE.Vector3, blockSafe = true): boolean {
    const start = this.nav.nearest(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    const end = this.nav.nearest(p.x, p.y, p.z, (n) => !blockSafe || !n.room || !this.hooks.safeRooms.has(n.room));
    const path = this.nav.path(start, end, blockSafe ? (n) => !!n.room && this.hooks.safeRooms.has(n.room) : undefined);
    if (!path.length) return false;
    this.path = path;
    this.pathIdx = 0;
    return true;
  }

  private randomPatrolTarget(player: THREE.Vector3): NavNode {
    const nodes = this.nav.nodes.filter(
      (n) => this.allowedFloors.has(n.floor) && n.tag !== 'outside' && !(n.room && this.hooks.safeRooms.has(n.room)),
    );
    // Higher aggression drifts patrols toward the player's floor.
    const pf = Math.round(player.y / 3.4);
    const pool = Math.random() < 0.3 + this.aggression * 0.5 ? nodes.filter((n) => n.floor === pf) : nodes;
    const list = pool.length ? pool : nodes;
    return list[Math.floor(Math.random() * list.length)]!;
  }

  private respawnFar(player: THREE.Vector3, minDist: number): void {
    const cands = this.nav.nodes.filter(
      (n) =>
        this.allowedFloors.has(n.floor) &&
        n.tag !== 'outside' &&
        Math.hypot(n.x - player.x, (n.y - player.y) * 2, n.z - player.z) > minDist &&
        !(n.room && this.hooks.safeRooms.has(n.room)),
    );
    const n = cands[Math.floor(Math.random() * cands.length)] ?? this.nav.nodes[0]!;
    this.body.materialize(new THREE.Vector3(n.x, n.y, n.z), Math.random() * Math.PI * 2, 0.6);
    this.path = [];
  }

  /** Can she see the player right now? Returns a 0..1 visibility factor. */
  private visibility(p: PlayerView): number {
    if (p.hidden) return 0;
    const head = this.tmp.copy(this.body.pos).setY(this.body.pos.y + 1.55);
    const to = new THREE.Vector3().subVectors(p.eye, head);
    const d = to.length();
    const range = (p.flashlightOn ? 22 : p.crouching ? 7 : 12) * (0.8 + this.aggression * 0.3);
    if (d > range) return 0;
    const fwd = new THREE.Vector3(Math.sin(this.body.yaw), 0, Math.cos(this.body.yaw));
    const cos = (to.x * fwd.x + to.z * fwd.z) / Math.max(0.001, Math.hypot(to.x, to.z));
    const cone = this.state === 'CHASE' ? -0.2 : 0.35;
    // Very close: she senses you regardless of facing.
    if (cos < cone && d > 2.2) return 0;
    if (this.col.segmentBlocked(head.x, head.y, head.z, p.eye.x, p.eye.y, p.eye.z)) return 0;
    return Math.max(0.15, 1 - d / range);
  }

  update(dt: number, p: PlayerView): void {
    this.time += dt;
    this.stateT += dt;
    if (this.state === 'DORMANT') return;
    const b = this.body;
    const distToPlayer = b.pos.distanceTo(p.pos);
    // Perception.
    const vis = this.state === 'RETREAT' ? 0 : this.visibility(p);
    if (vis > 0) {
      this.awareness = Math.min(1, this.awareness + dt * vis * (1.6 + this.aggression * 2.4));
      this.lastKnown.copy(p.pos);
    } else this.awareness = Math.max(0, this.awareness - dt * 0.25);

    // Flashlight beam pointed at her from a distance draws her attention.
    if (p.flashlightOn && vis === 0 && distToPlayer < 18 && this.state === 'PATROL' && Math.random() < dt * 0.15 * this.aggression) {
      const lit = !this.col.segmentBlocked(b.pos.x, b.pos.y + 1.5, b.pos.z, p.eye.x, p.eye.y, p.eye.z);
      if (lit) {
        this.lastKnown.copy(p.pos);
        this.goTo(p.pos);
        this.setState('INVESTIGATE');
        this.debug = 'saw light';
      }
    }

    const inSafe = !!p.room && this.hooks.safeRooms.has(p.room);
    let speed = 0;
    switch (this.state) {
      case 'IDLE':
        b.play('idle');
        if (this.stateT > 3 + Math.random() * 2) this.setState('PATROL');
        if (this.awareness >= 1 && !inSafe) this.setState('CHASE');
        break;
      case 'PATROL': {
        b.play('walk');
        speed = 0.95 + this.aggression * 0.35;
        if (this.pathIdx >= this.path.length) {
          const tgt = this.randomPatrolTarget(p.pos);
          if (!this.goTo(new THREE.Vector3(tgt.x, tgt.y, tgt.z))) this.setState('IDLE');
        }
        if (this.awareness > 0.45 && !inSafe) {
          this.goTo(this.lastKnown);
          this.setState('INVESTIGATE');
        }
        if (this.awareness >= 1 && !inSafe) this.setState('CHASE');
        break;
      }
      case 'INVESTIGATE':
        b.play('stalk');
        speed = 1.25 + this.aggression * 0.5;
        if (this.awareness >= 1 && !inSafe) this.setState('CHASE');
        else if (this.pathIdx >= this.path.length) {
          this.searchLeft = 3;
          this.setState('SEARCH');
        }
        if (this.stateT > 25) this.setState('PATROL');
        break;
      case 'SEARCH':
        b.play('stalk');
        speed = 0.9;
        if (this.awareness >= 1 && !inSafe) this.setState('CHASE');
        else if (this.pathIdx >= this.path.length) {
          if (this.searchLeft-- <= 0) {
            this.setState(this.aggression > 0.7 ? 'PATROL' : 'RETREAT');
          } else {
            // Check nearby nodes around the last known position.
            const near = this.nav.nodes.filter(
              (n) => Math.hypot(n.x - this.lastKnown.x, n.z - this.lastKnown.z) < 7 && Math.abs(n.y - this.lastKnown.y) < 1.5,
            );
            const n = near[Math.floor(Math.random() * near.length)];
            if (n) this.goTo(new THREE.Vector3(n.x, n.y, n.z));
            else this.setState('PATROL');
          }
        }
        break;
      case 'CHASE': {
        b.play('chase');
        this.chaseTime += dt;
        // Slower than a sprint but faster than walking, and she never tires.
        speed = 3.0 + this.aggression * 0.7 + Math.min(0.5, this.chaseTime * 0.02);
        if (p.hidden) {
          if (p.seenHiding || vis > 0) {
            this.inspecting = p.hidden;
            this.goTo(p.hidden.inspect, false);
            this.setState('INSPECT');
            break;
          }
          this.lostT += dt;
        } else if (vis > 0) {
          this.lostT = 0;
          // Re-path toward the player frequently.
          if (this.stateT > 0.4) {
            this.stateT = 0;
            this.goTo(p.pos, true);
          }
        } else this.lostT += dt;
        if (inSafe) {
          // She will not cross the threshold of a safe room.
          this.debug = 'player safe';
          this.setState('RETREAT');
          bus.emit('sfx', { name: 'ghostMoan', pos: b.pos.clone().setY(b.pos.y + 1.6), volume: 0.8 });
          break;
        }
        if (this.lostT > 5) {
          this.lostT = 0;
          this.goTo(this.lastKnown);
          this.searchLeft = 3;
          this.setState('SEARCH');
          break;
        }
        // Direct pursuit once close and in sight.
        if (vis > 0 && distToPlayer < 4) this.path = [];
        if (distToPlayer < 1.05 && vis > 0 && Math.abs(p.pos.y - b.pos.y) < 1.2) this.startAttack();
        break;
      }
      case 'INSPECT': {
        b.play(this.pathIdx >= this.path.length ? 'idle' : 'stalk');
        speed = 1.6;
        const spot = this.inspecting;
        if (!spot || !p.hidden) {
          this.setState('SEARCH');
          break;
        }
        if (this.pathIdx >= this.path.length) {
          b.lookAt(spot.cam);
          if (this.stateT > 2.6) {
            const chance = (p.seenHiding ? 0.75 : 0.25) * (p.holdingBreath ? 0.3 : 1) * (0.6 + this.aggression * 0.5);
            if (Math.random() < chance) this.startAttack();
            else {
              bus.emit('sfx', { name: 'ghostBreath', pos: b.pos.clone().setY(b.pos.y + 1.6), volume: 1 });
              this.inspecting = null;
              this.searchLeft = 1;
              this.setState('RETREAT');
            }
          }
        } else this.stateT = 0;
        break;
      }
      case 'ATTACK':
        b.play('attack');
        speed = 0;
        b.lookAt(p.eye);
        if (this.stateT > 1.1) {
          this.hooks.onCaught();
          this.setState('DORMANT');
        }
        break;
      case 'RETREAT':
        b.play('walk');
        speed = 1.0;
        if (this.stateT > 2.5 && b.visible) b.vanish(0.8);
        if (this.stateT > 4) {
          this.respawnT = 14 + Math.random() * 18 * (1 - this.aggression);
          this.path = [];
          b.hide();
          this.setState('IDLE');
          this.stateT = -this.respawnT;
          this.respawnPending = true;
        }
        break;
      default:
        break;
    }
    if (this.respawnPending && this.state === 'IDLE' && this.stateT >= 0) {
      this.respawnPending = false;
      this.respawnFar(p.pos, 16);
      this.setState('PATROL');
    }
    if (!b.rig.root.visible && this.state !== 'IDLE') b.materialize(b.pos, b.yaw, 1);
    this.move(dt, speed, p);
    b.update(dt, this.time, speed, distToPlayer);
    if (this.state === 'CHASE' || this.state === 'INVESTIGATE') b.lookAt(vis > 0 ? p.eye : null);
  }

  private respawnPending = false;

  private startAttack(): void {
    this.setState('ATTACK');
    bus.emit('sfx', { name: 'ghostScream', volume: 1 });
    bus.emit('scare', { kind: 'attack' });
  }

  private move(dt: number, speed: number, p: PlayerView): void {
    if (speed <= 0) return;
    const b = this.body;
    let target: THREE.Vector3 | null = null;
    if (this.pathIdx < this.path.length) {
      const n = this.nav.nodes[this.path[this.pathIdx]!]!;
      target = this.tmp.set(n.x, n.y, n.z);
      if (Math.hypot(n.x - b.pos.x, n.z - b.pos.z) < 0.35 && Math.abs(n.y - b.pos.y) < 0.4) {
        this.pathIdx++;
        this.openDoorNear(n);
      }
    } else if (this.state === 'CHASE') target = this.tmp.copy(p.pos);
    if (!target) return;
    const dx = target.x - b.pos.x;
    const dz = target.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const step = Math.min(dist, speed * dt);
    if (dist > 0.01) {
      b.pos.x += (dx / dist) * step;
      b.pos.z += (dz / dist) * step;
      // Height follows the path segment (stairs).
      const vy = target.y - b.pos.y;
      b.pos.y += Math.sign(vy) * Math.min(Math.abs(vy), (Math.abs(vy) / Math.max(0.3, dist)) * step + dt * 0.2);
      const want = Math.atan2(dx, dz);
      let dy = want - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * 6);
    }
    // Stuck detection: re-path.
    if (b.pos.distanceToSquared(this.prevPos) < 0.0001) {
      this.stuckT += dt;
      if (this.stuckT > 2) {
        this.stuckT = 0;
        this.path = [];
      }
    } else this.stuckT = 0;
    this.prevPos.copy(b.pos);
  }

  private openDoorNear(n: NavNode): void {
    if (!n.room || (n.tag !== 'door' && n.tag !== 'doorOut')) return;
    const d = this.hooks.doors.get(n.room);
    if (d && !d.isOpen && !d.locked) d.setOpen(true, this.state === 'CHASE' ? 6 : 2.2);
  }

  /** Places her somewhere specific (story). */
  placeAt(pos: THREE.Vector3, yaw: number, state: AIState = 'IDLE'): void {
    this.body.snapIn(pos, yaw);
    this.path = [];
    this.setState(state);
  }

  /** Walks toward a point to investigate (scripted). */
  investigate(p: THREE.Vector3): void {
    this.lastKnown.copy(p);
    this.goTo(p);
    this.setState('INVESTIGATE');
  }

  /** Immediately hunts toward the player (scripted chase start). */
  forceChase(player: THREE.Vector3): void {
    this.lastKnown.copy(player);
    this.awareness = 1;
    this.goTo(player);
    this.setState('CHASE');
  }
}
