/**
 * Axis-aligned box collision world. Pure TypeScript (no three.js) so it can be unit tested.
 * The player is a vertical cylinder; the ghost's sight lines are segment tests against boxes.
 */
export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  enabled: boolean;
  /** Blocks line of sight and sound (walls, closed doors). */
  opaque: boolean;
  tag: string;
  id: number;
}

export type BoxInit = Omit<Box, 'enabled' | 'opaque' | 'tag' | 'id'> & Partial<Pick<Box, 'enabled' | 'opaque' | 'tag'>>;

const CELL = 4;

export class CollisionWorld {
  readonly boxes: Box[] = [];
  private readonly grid = new Map<number, Box[]>();
  private nextId = 1;
  private stamp = 0;
  private readonly marks = new Map<number, number>();

  add(init: BoxInit): Box {
    const b: Box = {
      enabled: true,
      opaque: true,
      tag: 'wall',
      ...init,
      id: this.nextId++,
    };
    if (b.minX > b.maxX) [b.minX, b.maxX] = [b.maxX, b.minX];
    if (b.minY > b.maxY) [b.minY, b.maxY] = [b.maxY, b.minY];
    if (b.minZ > b.maxZ) [b.minZ, b.maxZ] = [b.maxZ, b.minZ];
    this.boxes.push(b);
    this.index(b);
    return b;
  }

  /** Re-index after moving a box (doors, lift car). */
  update(b: Box): void {
    this.unindex(b);
    this.index(b);
  }

  remove(b: Box): void {
    this.unindex(b);
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  private key(cx: number, cz: number): number {
    return (cx + 512) * 4096 + (cz + 512);
  }

  private cells(b: Box, fn: (k: number) => void) {
    const x0 = Math.floor(b.minX / CELL);
    const x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL);
    const z1 = Math.floor(b.maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) fn(this.key(x, z));
  }

  private index(b: Box) {
    this.cells(b, (k) => {
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(b);
    });
  }

  private unindex(b: Box) {
    this.cells(b, (k) => {
      const list = this.grid.get(k);
      if (!list) return;
      const i = list.indexOf(b);
      if (i >= 0) list.splice(i, 1);
    });
  }

  /** Boxes whose XZ footprint may overlap the given rectangle (deduplicated). */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: Box[] = []): Box[] {
    out.length = 0;
    this.stamp++;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const list = this.grid.get(this.key(x, z));
        if (!list) continue;
        for (const b of list) {
          if (!b.enabled || this.marks.get(b.id) === this.stamp) continue;
          this.marks.set(b.id, this.stamp);
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  private readonly tmp: Box[] = [];

  /** Highest walkable surface under a circle that is no higher than `maxY`. */
  groundHeight(x: number, z: number, r: number, maxY: number): number {
    let best = -Infinity;
    const list = this.query(x - r, z - r, x + r, z + r, this.tmp);
    for (const b of list) {
      if (b.maxY > maxY || b.maxY <= best) continue;
      if (circleHitsRect(x, z, r * 0.7, b)) best = b.maxY;
    }
    return best;
  }

  /** Lowest ceiling above `minY` over a circle. */
  ceilingHeight(x: number, z: number, r: number, minY: number): number {
    let best = Infinity;
    const list = this.query(x - r, z - r, x + r, z + r, this.tmp);
    for (const b of list) {
      if (b.minY < minY || b.minY >= best) continue;
      if (circleHitsRect(x, z, r, b)) best = b.minY;
    }
    return best;
  }

  /**
   * Pushes a vertical cylinder (feet at y, height h) out of every box that overlaps its body above
   * the step height. Returns true if any push happened. Mutates pos.
   */
  resolveCylinder(pos: { x: number; y: number; z: number }, r: number, h: number, stepUp: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this.tmp);
      for (const b of list) {
        if (b.maxY <= pos.y + stepUp || b.minY >= pos.y + h) continue;
        const cx = clamp(pos.x, b.minX, b.maxX);
        const cz = clamp(pos.z, b.minZ, b.maxZ);
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const pl = pos.x - b.minX + r;
          const pr = b.maxX - pos.x + r;
          const pb = pos.z - b.minZ + r;
          const pf = b.maxZ - pos.z + r;
          const m = Math.min(pl, pr, pb, pf);
          dx = m === pl ? -pl : m === pr ? pr : 0;
          dz = m === pb ? -pb : m === pf ? pf : 0;
          pos.x += dx;
          pos.z += dz;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** True if the segment a→b passes through any opaque box. */
  segmentBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignoreTag?: string): boolean {
    const t = this.raycast(ax, ay, az, bx - ax, by - ay, bz - az, 1, true, ignoreTag);
    return t < 1;
  }

  /** Returns the parametric distance (in units of the direction vector) to the nearest hit, or Infinity. */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxT: number,
    opaqueOnly = false,
    ignoreTag?: string,
  ): number {
    const ex = ox + dx * maxT;
    const ez = oz + dz * maxT;
    const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this.tmp);
    let best = Infinity;
    for (const b of list) {
      if (opaqueOnly && !b.opaque) continue;
      if (ignoreTag && b.tag === ignoreTag) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t >= 0 && t <= maxT && t < best) best = t;
    }
    return best;
  }
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

function circleHitsRect(x: number, z: number, r: number, b: Box): boolean {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz <= r * r;
}

/** Slab test. Returns entry t (0 if the origin is inside), or -1 when missed. */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < mn || o > mx) return -1;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return tmin < 0 ? 0 : tmin;
}
