/**
 * Waypoint navigation graph for the ghost (pure TS, unit tested). Nodes cover the corridors,
 * the accessible rooms, the stairs and the lobby/courtyard. A* finds paths between nodes.
 */
import { BAY, NBAYS, ROOMS, STAIR, doorCenter, floorY, roomBounds, XMAX } from '../world/layout';

export interface NavNode {
  id: number;
  x: number;
  y: number;
  z: number;
  floor: number;
  tag: string;
  /** Room id when the node is inside a room. */
  room?: string;
  links: number[];
}

export class NavGraph {
  readonly nodes: NavNode[] = [];

  add(x: number, y: number, z: number, tag: string, room?: string): number {
    const id = this.nodes.length;
    this.nodes.push({ id, x, y, z, floor: Math.round(y / 3.4), tag, room, links: [] });
    return id;
  }

  link(a: number, b: number): void {
    if (a === b) return;
    if (!this.nodes[a]!.links.includes(b)) this.nodes[a]!.links.push(b);
    if (!this.nodes[b]!.links.includes(a)) this.nodes[b]!.links.push(a);
  }

  nearest(x: number, y: number, z: number, filter?: (n: NavNode) => boolean): number {
    let best = -1;
    let bd = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const dy = (n.y - y) * 4; // strongly prefer the same floor
      const d = (n.x - x) ** 2 + dy * dy + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  dist(a: number, b: number): number {
    const p = this.nodes[a]!;
    const q = this.nodes[b]!;
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  }

  /** A* path from a to b (inclusive). Empty when unreachable. `blocked` excludes nodes. */
  path(a: number, b: number, blocked?: (n: NavNode) => boolean): number[] {
    if (a < 0 || b < 0) return [];
    if (a === b) return [a];
    const open = new Set<number>([a]);
    const came = new Map<number, number>();
    const g = new Map<number, number>([[a, 0]]);
    const f = new Map<number, number>([[a, this.dist(a, b)]]);
    while (open.size) {
      let cur = -1;
      let best = Infinity;
      for (const n of open) {
        const v = f.get(n) ?? Infinity;
        if (v < best) {
          best = v;
          cur = n;
        }
      }
      if (cur === b) {
        const out = [cur];
        while (came.has(cur)) {
          cur = came.get(cur)!;
          out.unshift(cur);
        }
        return out;
      }
      open.delete(cur);
      for (const nb of this.nodes[cur]!.links) {
        if (blocked && nb !== b && blocked(this.nodes[nb]!)) continue;
        const tg = (g.get(cur) ?? Infinity) + this.dist(cur, nb);
        if (tg < (g.get(nb) ?? Infinity)) {
          came.set(nb, cur);
          g.set(nb, tg);
          f.set(nb, tg + this.dist(nb, b));
          open.add(nb);
        }
      }
    }
    return [];
  }
}

/** Builds the hostel's navigation graph from the layout. */
export function buildNavGraph(): NavGraph {
  const g = new NavGraph();
  const corridor: number[][] = [[], [], []];
  for (const f of [0, 2]) {
    const y = floorY(f);
    for (let b = 0; b < NBAYS; b++) {
      corridor[f]!.push(g.add(b * BAY + BAY / 2, y, 0, `corr${f}`));
      if (b > 0) g.link(corridor[f]![b - 1]!, corridor[f]![b]!);
    }
  }
  // First floor: only the landing behind the grille.
  corridor[1]!.push(g.add(1.8, floorY(1), 0, 'corr1'));

  // Rooms with interiors (door node + centre + a corner).
  for (const r of ROOMS) {
    if (r.floor === 1) continue;
    const accessible = ['dorm', 'security', 'warden', 'records', 'common', 'electrical', 'bathroom', 'study', 'lobby'].includes(r.kind);
    if (!accessible) continue;
    const y = floorY(r.floor);
    const b = roomBounds(r);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const centre = g.add(cx, y, cz, 'room', r.id);
    const back = g.add(cx + (r.side === 'S' ? -0.6 : 0.6), y, r.side === 'S' ? b.z1 - 0.9 : b.z0 + 0.9, 'room', r.id);
    g.link(centre, back);
    const corrNode = corridor[r.floor]![r.bay]!;
    if (r.kind === 'lobby') {
      g.link(centre, corrNode);
      g.link(centre, corridor[r.floor]![r.bay + 1]!);
      continue;
    }
    if (r.kind === 'records') {
      // Only reachable through the warden's office.
      const w = g.nodes.find((n) => n.room === 'warden' && n.tag === 'room');
      if (w) g.link(centre, w.id);
      continue;
    }
    const dc = doorCenter(r);
    if (!dc) continue;
    const inside = g.add(dc.x, y, dc.z + (r.side === 'S' ? 0.6 : -0.6), 'door', r.id);
    const outside = g.add(dc.x, y, r.side === 'S' ? 0.5 : -0.5, 'doorOut', r.id);
    g.link(inside, centre);
    g.link(inside, outside);
    g.link(outside, corrNode);
    // Corridor neighbours too, so paths don't zig-zag to bay centres.
    const nb = corridor[r.floor]![Math.min(NBAYS - 1, Math.floor(dc.x / BAY + 0.5))];
    if (nb !== undefined) g.link(outside, nb);
  }

  // Stairs: chain from each floor's bay-0 corridor node up flight A, landing, flight B.
  for (let f = 0; f < 2; f++) {
    const y = floorY(f);
    const bottom = f === 0 ? corridor[0]![0]! : corridor[1]![0]!;
    const aStart = g.add((STAIR.aX0 + STAIR.aX1) / 2, y, -1.6, 'stair');
    const aTop = g.add((STAIR.aX0 + STAIR.aX1) / 2, y + 1.6, -4.0, 'stair');
    const land = g.add(1.8, y + 1.7, -4.8, 'stair');
    const bBot = g.add((STAIR.bX0 + STAIR.bX1) / 2, y + 1.8, -4.0, 'stair');
    const bTop = g.add((STAIR.bX0 + STAIR.bX1) / 2, y + 3.3, -1.6, 'stair');
    g.link(bottom, aStart);
    g.link(aStart, aTop);
    g.link(aTop, land);
    g.link(land, bBot);
    g.link(bBot, bTop);
    const top = f === 0 ? corridor[1]![0]! : corridor[2]![0]!;
    g.link(bTop, top);
  }

  // Courtyard path from the lobby to the gate.
  const lobbyOut = g.add(18, 0, 7.5, 'outside');
  const lobbyCentre = g.nodes.find((n) => n.room === 'lobby')!;
  g.link(lobbyCentre.id, lobbyOut);
  let prev = lobbyOut;
  for (const z of [13, 19, 25, 30]) {
    const n = g.add(18, 0, z, 'outside');
    g.link(prev, n);
    prev = n;
  }
  // Balcony at the east end of the second floor.
  const bal = g.add(XMAX + 1.5, floorY(2), 0, 'balcony');
  g.link(bal, corridor[2]![NBAYS - 1]!);
  return g;
}
