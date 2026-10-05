/**
 * Procedural PBR material recipes. Every recipe paints one tileable texture set:
 * albedo (sRGB), height (→ normal map), roughness, ambient occlusion and metalness.
 *
 * Pure TypeScript (no DOM / three.js) so recipes run inside the texture worker pool and in tests.
 * v = 0 is the bottom row of the texture, which for wall recipes is the floor line.
 */
import { TileNoise, clamp01, heightToNormal, lerp, smoothstep } from '../../core/noise';
import { Rng, hashString } from '../../core/rng';

export interface Px {
  r: number;
  g: number;
  b: number;
  h: number;
  rough: number;
  ao: number;
  metal: number;
  a: number;
}

export interface RecipeCtx {
  size: number;
  n: TileNoise;
  m: TileNoise;
  rng: Rng;
}

type PixelFn = (u: number, v: number, p: Px) => void;
type Recipe = (ctx: RecipeCtx) => PixelFn;

export interface RecipeInfo {
  recipe: Recipe;
  normalStrength: number;
  alpha?: boolean;
}

const hex = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const mix3 = (p: Px, c: [number, number, number], t: number) => {
  p.r = lerp(p.r, c[0], t);
  p.g = lerp(p.g, c[1], t);
  p.b = lerp(p.b, c[2], t);
};
const set3 = (p: Px, c: [number, number, number], k = 1) => {
  p.r = c[0] * k;
  p.g = c[1] * k;
  p.b = c[2] * k;
};
const mul = (p: Px, k: number) => {
  p.r *= k;
  p.g *= k;
  p.b *= k;
};

/** Square tile grid helper: returns local coords inside the tile and distance to the nearest grout line. */
function tileGrid(u: number, v: number, cols: number, rows: number, offsetOddRows = 0) {
  const ty = Math.floor(v * rows);
  const ux = u * cols + (ty % 2 === 1 ? offsetOddRows : 0);
  const tx = Math.floor(ux);
  const lu = ux - tx;
  const lv = v * rows - ty;
  const edge = Math.min(lu, 1 - lu, lv, 1 - lv);
  return { tx: ((tx % cols) + cols) % cols, ty, lu, lv, edge, id: (((tx % cols) + cols) % cols) * 131 + ty * 977 };
}

const hash01 = (i: number) => {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------------------------

/** Corridor wall: lime-washed upper wall over an oil-painted dado, the classic Indian hostel look. */
function hostelWall(upper: number, dado: number, stripe: number, dadoTop = 1.2 / 3.2): Recipe {
  const U = hex(upper);
  const D = hex(dado);
  const S = hex(stripe);
  return ({ n, m }) =>
    (u, v, p) => {
      const grain = n.fbm(u, v, 24, 3);
      const big = n.fbm(u + 0.31, v * 0.5, 3, 4);
      const stain = m.fbm(u, v, 5, 5);
      p.metal = 0;
      p.a = 1;
      if (v < dadoTop) {
        // Glossy oil paint, chipped in places to reveal plaster.
        set3(p, D, 0.92 + grain * 0.12);
        p.rough = 0.38 + grain * 0.15;
        p.h = 0.6 + grain * 0.04;
        const chip = m.fbm(u * 1.3 + 7.1, v * 1.3, 18, 4) + smoothstep(0.1, 0.0, v) * 0.08;
        if (chip > 0.74) {
          set3(p, U, 0.8 + grain * 0.15);
          p.rough = 0.9;
          p.h = 0.45;
        }
        // Scuffs from buckets and feet near the bottom.
        const scuff = smoothstep(0.12, 0.0, v) * (0.4 + 0.6 * n.fbm(u * 3, v, 16, 3));
        mul(p, 1 - scuff * 0.45);
        const stripeD = Math.abs(v - (dadoTop - 0.008));
        if (stripeD < 0.01) {
          set3(p, S, 0.9 + grain * 0.1);
          p.rough = 0.3;
        }
      } else {
        set3(p, U, 0.86 + grain * 0.1 + (big - 0.5) * 0.12);
        p.rough = 0.88 + grain * 0.1;
        p.h = 0.5 + grain * 0.06 + big * 0.05;
        // Monsoon seepage stains spreading from the ceiling and from corners.
        const seep = smoothstep(0.64, 0.84, stain + smoothstep(0.8, 1.0, v) * 0.22);
        mix3(p, [0.45, 0.4, 0.3], seep * 0.38);
        const ring = Math.abs(stain - 0.66);
        if (ring < 0.008) mul(p, 0.8);
        // Fine hairline cracks.
        const crack = n.ridged(u + 0.5, v * 0.8, 6, 4);
        if (crack > 0.82) {
          const k = smoothstep(0.82, 0.95, crack);
          mul(p, 1 - k * 0.5);
          p.h -= k * 0.15;
        }
        // Grimy hand-height band just above the dado.
        mul(p, 1 - smoothstep(dadoTop + 0.12, dadoTop, v) * 0.12 * big);
      }
      // Skirting dirt.
      mul(p, 1 - smoothstep(0.06, 0.0, v) * 0.5);
      p.ao = 1 - smoothstep(0.05, 0, v) * 0.4 - smoothstep(0.95, 1, v) * 0.3;
    };
}

/** Room wall: flat distemper colour, tape marks, pencil scribbles, damp patches. */
function roomWall(base: number): Recipe {
  const B = hex(base);
  return ({ n, m, rng }) => {
    const tapes: [number, number][] = [];
    for (let i = 0; i < 10; i++) tapes.push([rng.next(), rng.range(0.35, 0.8)]);
    return (u, v, p) => {
      const grain = n.fbm(u, v, 20, 3);
      const big = m.fbm(u, v, 3, 4);
      set3(p, B, 0.85 + grain * 0.12 + (big - 0.5) * 0.14);
      p.rough = 0.92;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + grain * 0.05;
      const damp = smoothstep(0.6, 0.78, m.fbm(u + 3.3, v, 4, 5) + smoothstep(0.3, 0, v) * 0.25);
      mix3(p, [0.36, 0.34, 0.27], damp * 0.5);
      // Rectangular sun-faded marks where posters used to hang.
      for (const [tu, tv] of tapes) {
        const du = Math.abs(u - tu);
        const dv = Math.abs(v - tv);
        if (du < 0.07 && dv < 0.09) {
          const edge = Math.min(0.07 - du, 0.09 - dv);
          mul(p, edge < 0.004 ? 0.86 : 1.06);
          if ((du > 0.06 && dv > 0.075) || (du > 0.06 && dv < 0.01)) set3(p, [0.78, 0.72, 0.55], 0.95);
        }
      }
      mul(p, 1 - smoothstep(0.05, 0.0, v) * 0.45);
      p.ao = 1 - smoothstep(0.05, 0, v) * 0.35;
    };
  };
}

function ceiling(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 16, 4);
      set3(p, [0.8, 0.79, 0.74], 0.88 + g * 0.1);
      p.rough = 0.95;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + g * 0.08;
      const stain = m.fbm(u, v, 3, 5);
      const s = smoothstep(0.6, 0.76, stain);
      mix3(p, [0.45, 0.38, 0.25], s * 0.45);
      if (Math.abs(stain - 0.6) < 0.006) mul(p, 0.75);
      const mold = smoothstep(0.72, 0.85, n.fbm(u + 0.7, v + 0.2, 30, 3)) * s;
      mix3(p, [0.12, 0.13, 0.1], mold * 0.8);
      const crack = n.ridged(u, v, 5, 4);
      if (crack > 0.85) {
        mul(p, 0.7);
        p.h -= 0.1;
      }
      p.ao = 1;
    };
}

// ---------------------------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------------------------

/** Kota stone slabs (0.6 m), polished but scratched. Texture covers 1.2 m × 1.2 m. */
function kotaFloor(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const t = tileGrid(u, v, 2, 2);
      const tint = hash01(t.id);
      const base: [number, number, number] = [0.36 + tint * 0.05, 0.42 + tint * 0.04, 0.4 + tint * 0.03];
      const g = n.fbm(u + tint, v, 14, 4);
      set3(p, base, 0.82 + g * 0.3);
      // Thin pale veins characteristic of Kota limestone.
      const vein = n.ridged(u * 0.7 + tint, v + tint * 3, 4, 4);
      if (vein > 0.86) mix3(p, [0.62, 0.64, 0.6], smoothstep(0.86, 0.95, vein) * 0.5);
      p.rough = 0.32 + g * 0.2 + m.fbm(u, v, 10, 3) * 0.25;
      p.metal = 0;
      p.a = 1;
      p.h = 0.6;
      const dirt = m.fbm(u, v, 6, 4);
      mix3(p, [0.16, 0.15, 0.12], smoothstep(0.55, 0.8, dirt) * 0.5);
      p.rough += smoothstep(0.55, 0.8, dirt) * 0.3;
      // Grout joints.
      const gr = smoothstep(0.004, 0.0015, t.edge);
      mix3(p, [0.1, 0.1, 0.09], gr);
      p.h = lerp(p.h, 0.35, gr);
      p.rough = lerp(p.rough, 0.95, gr);
      p.ao = 1 - gr * 0.5;
      // Scratches.
      const sc = n.value(u * 400, v * 6, 400);
      if (sc > 0.985) p.rough = Math.min(1, p.rough + 0.2);
      p.rough = clamp01(p.rough);
    };
}

/** Grey terrazzo (mosaic) floor in 0.4 m tiles, used for corridors. Covers 1.2 m. */
function terrazzoFloor(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const t = tileGrid(u, v, 3, 3);
      const g = n.fbm(u, v, 20, 3);
      set3(p, [0.46, 0.45, 0.42], 0.86 + g * 0.14);
      // Marble chips.
      const c1 = n.value(u * 180, v * 180, 180);
      const c2 = m.value(u * 90 + 3, v * 90, 90);
      if (c1 > 0.78) set3(p, [0.78, 0.76, 0.7], 0.9 + c1 * 0.1);
      else if (c2 > 0.82) set3(p, [0.18, 0.17, 0.16], 1);
      else if (c1 < 0.12) set3(p, [0.55, 0.38, 0.3], 0.9);
      p.rough = 0.38 + m.fbm(u, v, 8, 4) * 0.35;
      p.metal = 0;
      p.a = 1;
      p.h = 0.6 + (c1 > 0.78 ? 0.02 : 0);
      const wear = m.fbm(u + 0.4, v, 3, 4);
      mul(p, 0.85 + wear * 0.25);
      const dirt = smoothstep(0.6, 0.85, n.fbm(u + 1.7, v + 0.3, 5, 5));
      mix3(p, [0.14, 0.12, 0.1], dirt * 0.55);
      p.rough = clamp01(p.rough + dirt * 0.3);
      const gr = smoothstep(0.006, 0.002, t.edge);
      mix3(p, [0.12, 0.12, 0.11], gr * 0.85);
      p.h = lerp(p.h, 0.4, gr);
      p.ao = 1 - gr * 0.4;
    };
}

/** White glazed wall tiles (0.2 m), stained grout, a few cracked. Covers 1.2 m. */
function bathWallTiles(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const t = tileGrid(u, v, 6, 6);
      const r = hash01(t.id);
      set3(p, [0.84, 0.86, 0.84], 0.92 + r * 0.06);
      p.rough = 0.12 + n.fbm(u, v, 30, 2) * 0.12;
      p.metal = 0;
      p.a = 1;
      // Pillowed tile surface.
      p.h = 0.55 + Math.min(t.lu, 1 - t.lu, t.lv, 1 - t.lv) * 0.4;
      const grime = smoothstep(0.55, 0.85, m.fbm(u, v, 4, 5) + smoothstep(0.4, 0, v) * 0.2);
      mix3(p, [0.45, 0.4, 0.28], grime * 0.5);
      p.rough += grime * 0.3;
      if (r > 0.94) {
        const cr = n.ridged(u * 3 + r, v * 3, 8, 3);
        if (cr > 0.9) {
          mul(p, 0.45);
          p.h -= 0.2;
        }
      }
      const gr = smoothstep(0.035, 0.012, t.edge);
      mix3(p, [0.36, 0.33, 0.27], gr);
      p.rough = lerp(p.rough, 0.9, gr);
      p.h = lerp(p.h, 0.3, gr);
      p.ao = 1 - gr * 0.5;
      p.rough = clamp01(p.rough);
    };
}

/** Wet terracotta anti-skid floor tiles (0.3 m). Covers 1.2 m. */
function bathFloorTiles(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const t = tileGrid(u, v, 4, 4);
      const r = hash01(t.id + 7);
      set3(p, [0.42 + r * 0.05, 0.22, 0.17], 0.85 + n.fbm(u, v, 25, 3) * 0.2);
      const dots = n.value(u * 160, v * 160, 160);
      p.h = 0.55 + (dots > 0.7 ? 0.08 : 0);
      p.metal = 0;
      p.a = 1;
      const wet = smoothstep(0.45, 0.6, m.fbm(u, v, 3, 4));
      p.rough = lerp(0.75, 0.08, wet);
      mul(p, 1 - wet * 0.3);
      const gr = smoothstep(0.03, 0.01, t.edge);
      mix3(p, [0.12, 0.1, 0.08], gr);
      p.h = lerp(p.h, 0.3, gr);
      p.ao = 1 - gr * 0.5;
    };
}

// ---------------------------------------------------------------------------------------------
// Exterior
// ---------------------------------------------------------------------------------------------

/** Weathered painted cement facade. v spans one storey (3.4 m); u spans 6.8 m. */
function facade(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 18, 4);
      set3(p, [0.6, 0.56, 0.47], 0.78 + g * 0.2);
      p.rough = 0.9;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + g * 0.12;
      // Black monsoon streaks running down from sills and the slab line.
      const streakN = m.fbm(u * 3, v * 0.25, 8, 4);
      const streak = smoothstep(0.45, 0.75, streakN) * (0.4 + 0.6 * smoothstep(0.2, 1.0, v));
      mix3(p, [0.12, 0.12, 0.1], streak * 0.75);
      // Algae near the bottom of each storey band.
      const alg = smoothstep(0.25, 0.0, v) * smoothstep(0.4, 0.7, m.fbm(u, v, 6, 4));
      mix3(p, [0.12, 0.16, 0.08], alg * 0.8);
      // Plaster patches.
      const patch = n.fbm(u + 3, v + 1, 4, 4);
      if (patch > 0.7) {
        mix3(p, [0.55, 0.55, 0.52], 0.6);
        p.h -= 0.05;
      }
      // Slab band line.
      if (v > 0.93) {
        mul(p, 0.85);
        p.h += 0.1;
      }
      p.ao = 1 - smoothstep(0.95, 1, v) * 0.2;
    };
}

function rawConcrete(tint = 0x8a8a84): Recipe {
  const T = hex(tint);
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 12, 5);
      const pores = n.value(u * 220, v * 220, 220);
      set3(p, T, 0.7 + g * 0.35);
      p.rough = 0.85 + g * 0.1;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + g * 0.2 - (pores > 0.88 ? 0.12 : 0);
      if (pores > 0.88) mul(p, 0.7);
      const wet = smoothstep(0.5, 0.75, m.fbm(u, v, 3, 4));
      mul(p, 1 - wet * 0.35);
      p.rough = lerp(p.rough, 0.25, wet);
      const lichen = smoothstep(0.7, 0.85, m.fbm(u + 5, v, 8, 4));
      mix3(p, [0.1, 0.12, 0.08], lichen * 0.6);
      p.ao = 1;
    };
}

/** Wet asphalt with gravel and puddles; puddles are mirror-smooth for the lights to glint in. */
function wetAsphalt(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 16, 4);
      const grav = n.value(u * 300, v * 300, 300);
      set3(p, [0.13, 0.13, 0.13], 0.75 + g * 0.5 + (grav > 0.8 ? 0.4 : 0));
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + g * 0.2 + (grav > 0.8 ? 0.06 : 0);
      const puddle = smoothstep(0.56, 0.62, m.fbm(u, v, 3, 5));
      p.rough = lerp(0.62 + g * 0.2, 0.03, puddle);
      mul(p, 1 - puddle * 0.45);
      p.h = lerp(p.h, 0.42, puddle);
      const crack = n.ridged(u, v, 4, 4);
      if (crack > 0.9) {
        mul(p, 0.5);
        p.h -= 0.1;
      }
      p.ao = 1;
    };
}

function mudGround(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 10, 5);
      const grass = smoothstep(0.45, 0.65, m.fbm(u, v, 6, 5));
      set3(p, [0.17, 0.12, 0.08], 0.7 + g * 0.5);
      const blades = n.value(u * 260, v * 60, 260);
      mix3(p, [0.12 + blades * 0.08, 0.17 + blades * 0.1, 0.06], grass * (0.6 + blades * 0.4));
      p.h = 0.5 + g * 0.25 + grass * blades * 0.15;
      p.metal = 0;
      p.a = 1;
      const puddle = smoothstep(0.62, 0.68, n.fbm(u + 2, v, 3, 4)) * (1 - grass);
      p.rough = lerp(0.85, 0.05, puddle);
      mul(p, 1 - puddle * 0.5);
      p.ao = 1;
    };
}

function brick(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const t = tileGrid(u, v, 4, 12, 0.5);
      const r = hash01(t.id + 3);
      const g = n.fbm(u, v, 30, 3);
      set3(p, [0.45 + r * 0.12, 0.2 + r * 0.06, 0.13], 0.75 + g * 0.35);
      p.rough = 0.88;
      p.metal = 0;
      p.a = 1;
      p.h = 0.6 + g * 0.1;
      const mortar = smoothstep(0.05, 0.025, Math.min(t.lu * 0.25, (1 - t.lu) * 0.25, t.lv * 0.75, (1 - t.lv) * 0.75) * 4);
      mix3(p, [0.48, 0.46, 0.42], mortar);
      p.h = lerp(p.h, 0.35, mortar);
      const soot = smoothstep(0.5, 0.8, m.fbm(u, v, 4, 4));
      mul(p, 1 - soot * 0.5);
      p.ao = 1 - mortar * 0.4;
    };
}

// ---------------------------------------------------------------------------------------------
// Wood, metal, fabric, misc
// ---------------------------------------------------------------------------------------------

function woodGrain(n: TileNoise, u: number, v: number): number {
  const w = n.fbm(u * 2, v * 0.3, 6, 3) * 6;
  const rings = Math.sin((u * 30 + w) * Math.PI * 2) * 0.5 + 0.5;
  return rings * 0.6 + n.value(u * 200, v * 8, 200) * 0.4;
}

function paintedWood(paint: number): Recipe {
  const P = hex(paint);
  return ({ n, m }) =>
    (u, v, p) => {
      const grain = woodGrain(n, u, v);
      const g = n.fbm(u, v, 18, 3);
      set3(p, P, 0.85 + g * 0.15 + grain * 0.05);
      p.rough = 0.45 + g * 0.2;
      p.metal = 0;
      p.a = 1;
      p.h = 0.6 + grain * 0.03;
      const chip = m.fbm(u, v, 22, 4) + smoothstep(0.12, 0, v) * 0.1;
      if (chip > 0.77) {
        const k = smoothstep(0.77, 0.8, chip);
        mix3(p, [0.3 + grain * 0.12, 0.22 + grain * 0.08, 0.15], k);
        p.rough = lerp(p.rough, 0.85, k);
        p.h -= k * 0.08;
      }
      const grime = smoothstep(0.5, 0.85, m.fbm(u + 4, v, 3, 4));
      mul(p, 1 - grime * 0.35);
      p.ao = 1;
    };
}

function rawWood(base = 0x6b4426): Recipe {
  const B = hex(base);
  return ({ n, m }) =>
    (u, v, p) => {
      const grain = woodGrain(n, u, v);
      set3(p, B, 0.65 + grain * 0.45);
      p.rough = 0.55 + grain * 0.2;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + grain * 0.15;
      const wear = smoothstep(0.55, 0.85, m.fbm(u, v, 5, 4));
      mix3(p, [0.12, 0.08, 0.05], wear * 0.4);
      const ring = smoothstep(0.7, 0.75, m.fbm(u + 2, v + 1, 3, 3));
      if (ring > 0 && ring < 1) mul(p, 0.8);
      p.ao = 1;
    };
}

function paintedMetal(paint: number, rustAmt = 0.3): Recipe {
  const P = hex(paint);
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 20, 3);
      set3(p, P, 0.85 + g * 0.15);
      p.rough = 0.4 + g * 0.2;
      p.metal = 0.25;
      p.a = 1;
      p.h = 0.6;
      const scratch = n.value(u * 500, v * 8, 500);
      if (scratch > 0.97) {
        set3(p, [0.55, 0.55, 0.55]);
        p.metal = 0.9;
        p.rough = 0.35;
      }
      const rust = smoothstep(1 - rustAmt, 1 - rustAmt + 0.15, m.fbm(u, v, 7, 5) + smoothstep(0.2, 0, v) * 0.2);
      const rc = n.fbm(u + 3, v, 40, 3);
      mix3(p, [0.36 + rc * 0.15, 0.17 + rc * 0.06, 0.07], rust);
      p.rough = lerp(p.rough, 0.92, rust);
      p.metal = lerp(p.metal, 0.1, rust);
      p.h += rust * (rc - 0.5) * 0.2;
      // Dents.
      p.h += (m.fbm(u + 9, v + 9, 4, 3) - 0.5) * 0.1;
      p.ao = 1;
    };
}

function rust(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 24, 5);
      const k = m.fbm(u, v, 8, 4);
      set3(p, [0.3 + g * 0.2, 0.13 + g * 0.08, 0.06], 0.8 + k * 0.4);
      const paint = smoothstep(0.55, 0.6, k);
      mix3(p, [0.07, 0.07, 0.07], paint * 0.9);
      p.rough = lerp(0.9, 0.5, paint);
      p.metal = lerp(0.2, 0.5, paint);
      p.a = 1;
      p.h = 0.5 + g * 0.3 + paint * 0.1;
      p.ao = 1;
    };
}

function mattress(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const stripe = Math.floor(u * 40) % 4;
      const base: [number, number, number] = stripe === 0 ? [0.22, 0.27, 0.42] : stripe === 2 ? [0.55, 0.22, 0.2] : [0.75, 0.72, 0.62];
      const weave = Math.sin(u * 1200) * Math.sin(v * 1200) * 0.5 + 0.5;
      set3(p, base, 0.8 + weave * 0.15);
      p.rough = 0.95;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + weave * 0.05 + n.fbm(u, v, 4, 3) * 0.2;
      const stain = smoothstep(0.6, 0.66, m.fbm(u, v, 4, 5));
      mix3(p, [0.45, 0.33, 0.15], stain * 0.6);
      if (Math.abs(m.fbm(u, v, 4, 5) - 0.6) < 0.006) mul(p, 0.7);
      p.ao = 1;
    };
}

function bedsheet(c1: number, c2: number): Recipe {
  const A = hex(c1);
  const B = hex(c2);
  return ({ n, m }) =>
    (u, v, p) => {
      const cu = Math.floor(u * 12) % 2;
      const cv = Math.floor(v * 12) % 2;
      const thin = (u * 48) % 1 < 0.08 || (v * 48) % 1 < 0.08;
      set3(p, cu === cv ? A : B);
      if (thin) mul(p, 0.75);
      const weave = Math.sin(u * 1400) * Math.sin(v * 1400) * 0.5 + 0.5;
      mul(p, 0.85 + weave * 0.12);
      p.rough = 0.92;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + n.fbm(u, v, 3, 4) * 0.4 + weave * 0.03;
      mul(p, 0.8 + m.fbm(u, v, 3, 3) * 0.3);
      p.ao = 1;
    };
}

function curtain(base: number): Recipe {
  const B = hex(base);
  return ({ n, m }) =>
    (u, v, p) => {
      const fold = Math.sin(u * Math.PI * 2 * 6 + n.fbm(u, v, 3, 3) * 2) * 0.5 + 0.5;
      set3(p, B, 0.6 + fold * 0.5);
      const motif = n.value(u * 40, v * 40, 40);
      if (motif > 0.8) mix3(p, [0.6, 0.45, 0.25], 0.35);
      mul(p, 0.85 + m.fbm(u, v, 4, 3) * 0.2);
      p.rough = 0.95;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + fold * 0.3;
      p.ao = 0.75 + fold * 0.25;
    };
}

function plastic(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 30, 2);
      set3(p, [1, 1, 1], 0.92 + g * 0.08);
      p.rough = 0.38 + g * 0.15;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + g * 0.02;
      const dirt = smoothstep(0.55, 0.85, m.fbm(u, v, 5, 4));
      mix3(p, [0.4, 0.35, 0.28], dirt * 0.4);
      p.rough += dirt * 0.3;
      p.ao = 1;
    };
}

function ceramic(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 12, 3);
      set3(p, [0.86, 0.86, 0.83], 0.95 + g * 0.05);
      p.rough = 0.08 + g * 0.06;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5;
      const stain = smoothstep(0.5, 0.8, m.fbm(u, v, 4, 5));
      mix3(p, [0.55, 0.42, 0.2], stain * 0.6);
      p.rough += stain * 0.4;
      p.ao = 1;
    };
}

/** Pale ghost skin: grey-green undertone, visible veins, blotchy bruising. */
function ghostSkin(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const g = n.fbm(u, v, 14, 5);
      set3(p, [0.66, 0.66, 0.6], 0.82 + g * 0.18);
      const vein = n.ridged(u, v, 5, 5);
      if (vein > 0.82) mix3(p, [0.25, 0.3, 0.38], smoothstep(0.82, 0.95, vein) * 0.6);
      const bruise = smoothstep(0.58, 0.8, m.fbm(u, v, 4, 5));
      mix3(p, [0.32, 0.26, 0.3], bruise * 0.6);
      const rot = smoothstep(0.72, 0.8, m.fbm(u + 3, v, 9, 4));
      mix3(p, [0.15, 0.1, 0.08], rot * 0.8);
      p.rough = 0.55 + g * 0.2 - rot * 0.3;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + g * 0.08 - rot * 0.15 + vein * 0.03;
      p.ao = 1;
    };
}

/** Old, dirty cotton salwar-kameez fabric with stains and a faded block print. */
function ghostCloth(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const weave = Math.sin(u * 900) * Math.sin(v * 900) * 0.5 + 0.5;
      set3(p, [0.72, 0.7, 0.62], 0.85 + weave * 0.08);
      const print = n.value(u * 30, v * 30, 30);
      if (print > 0.82) mix3(p, [0.5, 0.42, 0.5], 0.25);
      const grime = smoothstep(0.45, 0.85, m.fbm(u, v, 4, 5) + smoothstep(0.3, 0, v) * 0.35);
      mix3(p, [0.25, 0.22, 0.17], grime * 0.7);
      const blood = smoothstep(0.74, 0.78, n.fbm(u + 8, v, 5, 5));
      mix3(p, [0.22, 0.04, 0.03], blood * 0.85);
      p.rough = 0.92;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + weave * 0.05;
      p.ao = 1;
    };
}

/** Hair strand atlas: vertical strands in an alpha-tested strip. */
function hair(): Recipe {
  return ({ n }) =>
    (u, v, p) => {
      const strand = n.value(u * 128, v * 2, 128);
      const fine = n.value(u * 512, v * 3, 512);
      const a = smoothstep(0.35, 0.6, strand * 0.7 + fine * 0.3) * smoothstep(0.0, 0.25, v);
      set3(p, [0.03, 0.025, 0.025], 0.8 + fine * 0.6);
      p.rough = 0.55;
      p.metal = 0;
      p.h = 0.5 + strand * 0.3;
      p.a = a;
      p.ao = 1;
    };
}

/** Leaf cluster card for trees (alpha). */
function leaves(): Recipe {
  return ({ n, m, rng }) => {
    const L: { x: number; y: number; a: number; s: number }[] = [];
    for (let i = 0; i < 90; i++) L.push({ x: rng.next(), y: rng.next(), a: rng.range(0, Math.PI * 2), s: rng.range(0.05, 0.1) });
    return (u, v, p) => {
      p.a = 0;
      set3(p, [0.05, 0.09, 0.04]);
      p.rough = 0.7;
      p.metal = 0;
      p.h = 0.5;
      p.ao = 1;
      const du0 = u - 0.5;
      const dv0 = v - 0.5;
      if (du0 * du0 + dv0 * dv0 > 0.24) return;
      for (const l of L) {
        let dx = u - l.x;
        let dy = v - l.y;
        const c = Math.cos(l.a);
        const s = Math.sin(l.a);
        const rx = dx * c - dy * s;
        const ry = dx * s + dy * c;
        dx = rx / l.s;
        dy = ry / (l.s * 0.42);
        const d = dx * dx + dy * dy;
        if (d < 1) {
          const vein = Math.abs(ry / (l.s * 0.42)) < 0.08 ? 0.75 : 1;
          const t = n.value(l.x * 50, l.y * 50, 50);
          set3(p, [0.08 + t * 0.07, 0.17 + t * 0.1 + m.value(u * 20, v * 20, 20) * 0.05, 0.05 + t * 0.03], vein);
          p.a = 1;
          p.h = 0.5 + (1 - d) * 0.3;
          p.ao = 0.7 + (1 - d) * 0.3;
        }
      }
    };
  };
}

function bark(): Recipe {
  return ({ n, m }) =>
    (u, v, p) => {
      const ridges = n.ridged(u * 2, v * 0.4, 6, 4);
      set3(p, [0.2, 0.16, 0.12], 0.6 + ridges * 0.6);
      const moss = smoothstep(0.55, 0.75, m.fbm(u, v, 4, 4));
      mix3(p, [0.12, 0.16, 0.07], moss * 0.6);
      p.rough = 0.9;
      p.metal = 0;
      p.a = 1;
      p.h = ridges;
      p.ao = 0.6 + ridges * 0.4;
    };
}

function rubber(): Recipe {
  return ({ n }) =>
    (u, v, p) => {
      const tread = Math.abs(Math.sin(u * 120)) > 0.6 ? 1 : 0;
      set3(p, [0.05, 0.05, 0.05], 0.9 + n.fbm(u, v, 20, 2) * 0.2);
      p.rough = 0.8;
      p.metal = 0;
      p.a = 1;
      p.h = 0.5 + tread * 0.2;
      p.ao = 1;
    };
}

export const RECIPES: Record<string, RecipeInfo> = {
  wall_corridor: { recipe: hostelWall(0xd9d1b8, 0x4f7a68, 0x1d3a30), normalStrength: 2.5 },
  wall_stair: { recipe: hostelWall(0xd6cbb0, 0x7b6a4f, 0x3a2d1d), normalStrength: 2.5 },
  wall_room_blue: { recipe: roomWall(0x9fb5bf), normalStrength: 2 },
  wall_room_yellow: { recipe: roomWall(0xd3c38d), normalStrength: 2 },
  wall_room_green: { recipe: roomWall(0xa9bb98), normalStrength: 2 },
  wall_office: { recipe: hostelWall(0xd4ccb4, 0x6b5a42, 0x2b2015, 1.0 / 3.2), normalStrength: 2.5 },
  ceiling: { recipe: ceiling(), normalStrength: 2 },
  floor_kota: { recipe: kotaFloor(), normalStrength: 3 },
  floor_terrazzo: { recipe: terrazzoFloor(), normalStrength: 3 },
  tiles_wall: { recipe: bathWallTiles(), normalStrength: 4 },
  tiles_floor: { recipe: bathFloorTiles(), normalStrength: 4 },
  facade: { recipe: facade(), normalStrength: 3 },
  concrete: { recipe: rawConcrete(), normalStrength: 4 },
  concrete_dark: { recipe: rawConcrete(0x5d5c58), normalStrength: 4 },
  asphalt: { recipe: wetAsphalt(), normalStrength: 4 },
  mud: { recipe: mudGround(), normalStrength: 4 },
  brick: { recipe: brick(), normalStrength: 5 },
  wood_door_brown: { recipe: paintedWood(0x5a3a24), normalStrength: 2 },
  wood_door_green: { recipe: paintedWood(0x3d5a48), normalStrength: 2 },
  wood_door_blue: { recipe: paintedWood(0x3c5470), normalStrength: 2 },
  wood_raw: { recipe: rawWood(), normalStrength: 2 },
  wood_dark: { recipe: rawWood(0x3a2414), normalStrength: 2 },
  metal_almirah: { recipe: paintedMetal(0x6e7a76, 0.25), normalStrength: 1.5 },
  metal_black: { recipe: paintedMetal(0x1c1d1d, 0.35), normalStrength: 1.5 },
  metal_green: { recipe: paintedMetal(0x2f4a3c, 0.3), normalStrength: 1.5 },
  metal_cream: { recipe: paintedMetal(0xbdb59c, 0.2), normalStrength: 1.5 },
  rust: { recipe: rust(), normalStrength: 4 },
  mattress: { recipe: mattress(), normalStrength: 2 },
  sheet_check: { recipe: bedsheet(0x7a2f2f, 0xb8a98a), normalStrength: 2 },
  sheet_blue: { recipe: bedsheet(0x2d3e66, 0x8e9db8), normalStrength: 2 },
  curtain: { recipe: curtain(0x6b3d2e), normalStrength: 2 },
  curtain_green: { recipe: curtain(0x3e5a46), normalStrength: 2 },
  plastic: { recipe: plastic(), normalStrength: 1 },
  ceramic: { recipe: ceramic(), normalStrength: 1 },
  ghost_skin: { recipe: ghostSkin(), normalStrength: 2 },
  ghost_cloth: { recipe: ghostCloth(), normalStrength: 2 },
  hair: { recipe: hair(), normalStrength: 1, alpha: true },
  leaves: { recipe: leaves(), normalStrength: 2, alpha: true },
  bark: { recipe: bark(), normalStrength: 5 },
  rubber: { recipe: rubber(), normalStrength: 2 },
};

export interface TextureSetData {
  name: string;
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  orm: Uint8Array;
}

/** Runs a recipe and returns RGBA byte buffers. Used by the worker and as a fallback on the main thread. */
export function generateTextureSet(name: string, size: number): TextureSetData {
  const info = RECIPES[name];
  if (!info) throw new Error(`Unknown material recipe: ${name}`);
  const seed = hashString(name);
  const ctx: RecipeCtx = { size, n: new TileNoise(seed), m: new TileNoise(seed ^ 0x5bd1e995), rng: new Rng(seed) };
  const fn = info.recipe(ctx);
  const N = size * size;
  const albedo = new Uint8Array(N * 4);
  const orm = new Uint8Array(N * 4);
  const height = new Float32Array(N);
  const p: Px = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.8, ao: 1, metal: 0, a: 1 };
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      p.a = 1;
      fn(u, v, p);
      const i = y * size + x;
      const j = i * 4;
      albedo[j] = clamp01(p.r) * 255;
      albedo[j + 1] = clamp01(p.g) * 255;
      albedo[j + 2] = clamp01(p.b) * 255;
      albedo[j + 3] = clamp01(p.a) * 255;
      orm[j] = clamp01(p.ao) * 255;
      orm[j + 1] = clamp01(p.rough) * 255;
      orm[j + 2] = clamp01(p.metal) * 255;
      orm[j + 3] = 255;
      height[i] = p.h;
    }
  }
  const normal = new Uint8Array(N * 4);
  // Strength scales with resolution so detail looks the same at every texture quality.
  heightToNormal(height, size, info.normalStrength * (size / 256), normal);
  return { name, size, albedo, normal, orm };
}
