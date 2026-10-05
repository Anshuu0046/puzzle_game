/**
 * Tileable value noise + fBm used by the procedural texture generator.
 * Pure functions with no DOM dependency so they can be unit tested.
 */
export class TileNoise {
  private readonly perm: Uint8Array;
  private readonly vals: Float32Array;

  constructor(seed: number) {
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      this.vals[i] = rnd();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
  }

  /** Value noise at (x, y) that tiles every `period` units (period must be an integer). Range [0, 1]. */
  value(x: number, y: number, period: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const p = this.perm;
    const v = this.vals;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = v[p[p[x0 & 255]! + (y0 & 255)]!]!;
    const b = v[p[p[x1 & 255]! + (y0 & 255)]!]!;
    const c = v[p[p[x0 & 255]! + (y1 & 255)]!]!;
    const d = v[p[p[x1 & 255]! + (y1 & 255)]!]!;
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /** Fractal sum of tileable value noise. u, v in [0, 1). Range roughly [0, 1]. */
  fbm(u: number, v: number, baseFreq: number, octaves = 4, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = baseFreq;
    for (let o = 0; o < octaves; o++) {
      sum += this.value(u * f, v * f, f) * amp;
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }

  /** Ridged variant, good for cracks and veins. */
  ridged(u: number, v: number, baseFreq: number, octaves = 4): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = baseFreq;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.value(u * f, v * f, f) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Converts a height field into a tangent-space normal map (RGBA bytes). Wraps at the edges.
 * Row 0 is v = 0 (DataTexture convention, no flipY).
 */
export function heightToNormal(h: Float32Array, size: number, strength: number, out: Uint8Array | Uint8ClampedArray): void {
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size;
    const yp = ((y + 1) % size) * size;
    const yc = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (h[yc + xp]! - h[yc + xm]!) * strength;
      const dy = (h[yp + x]! - h[ym + x]!) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (yc + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
}
