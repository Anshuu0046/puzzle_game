/**
 * Procedural sound synthesis. Every sound in the game is rendered here into raw sample buffers
 * (no audio files), so the game works offline and the sounds can be swapped for recorded assets
 * later by dropping files into the same names (see AudioSystem.loadOverride).
 *
 * Pure TypeScript — no Web Audio dependency — so it is unit tested.
 */
import { Rng } from '../core/rng';

export interface Rendered {
  /** One Float32Array per channel. */
  channels: Float32Array[];
  sampleRate: number;
  loop: boolean;
}

// ---------------------------------------------------------------------------------------------
// DSP helpers
// ---------------------------------------------------------------------------------------------

/** RBJ biquad filter, processed in place. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private readonly sr: number,
    type: 'lowpass' | 'highpass' | 'bandpass' | 'peak',
    freq: number,
    q = 0.707,
    gainDb = 0,
  ) {
    this.set(type, freq, q, gainDb);
  }
  set(type: 'lowpass' | 'highpass' | 'bandpass' | 'peak', freq: number, q = 0.707, gainDb = 0): void {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.45)) / this.sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = sn / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cs) / 2;
        b1 = 1 - cs;
        b2 = (1 - cs) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cs) / 2;
        b1 = -(1 + cs);
        b2 = (1 + cs) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      default:
        b0 = 1 + alpha * A;
        b1 = -2 * cs;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cs;
        a2 = 1 - alpha / A;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }
  tick(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const TAU = Math.PI * 2;

function buf(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.floor(sr * seconds)));
}

/** Normalises to a peak and applies a fade at the end (or a seamless crossfade for loops). */
function finish(chs: Float32Array[], peak: number, loop: boolean, sr: number): Float32Array[] {
  let max = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) max = Math.max(max, Math.abs(c[i]!));
  const k = max > 0 ? peak / max : 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = c[i]! * k;
  if (loop) {
    return chs.map((c) => {
      const n = Math.min(Math.floor(sr * 0.25), Math.floor(c.length / 4));
      const out = c.slice(0, c.length - n);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        out[i] = c[i]! * t + c[c.length - n + i]! * (1 - t);
      }
      return out;
    });
  }
  for (const c of chs) {
    const f = Math.min(64, c.length);
    for (let i = 0; i < f; i++) c[c.length - 1 - i] = c[c.length - 1 - i]! * (i / f);
  }
  return chs;
}

const env = (t: number, a: number, d: number): number => (t < a ? t / a : Math.exp(-(t - a) / d));

class Noise {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private brown = 0;
  constructor(private readonly rng: Rng) {}
  white(): number {
    return this.rng.next() * 2 - 1;
  }
  pink(): number {
    const w = this.white();
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.2;
  }
  brownN(): number {
    this.brown = (this.brown + this.white() * 0.02) / 1.02;
    return this.brown * 3.5;
  }
}

// ---------------------------------------------------------------------------------------------
// Sound recipes
// ---------------------------------------------------------------------------------------------

type Recipe = (sr: number, rng: Rng) => Rendered;

const mono = (sr: number, data: Float32Array, peak: number, loop = false): Rendered => ({
  channels: finish([data], peak, loop, sr),
  sampleRate: sr,
  loop,
});
const stereo = (sr: number, l: Float32Array, r: Float32Array, peak: number, loop = false): Rendered => ({
  channels: finish([l, r], peak, loop, sr),
  sampleRate: sr,
  loop,
});

function footstep(surface: 'tile' | 'concrete' | 'wet' | 'metal' | 'mud', variant: number): Recipe {
  return (sr, rng) => {
    const d = buf(sr, 0.28);
    const n = new Noise(new Rng(variant * 977 + 13));
    const lp = new Biquad(sr, 'lowpass', surface === 'tile' ? 3200 : surface === 'metal' ? 5000 : surface === 'mud' ? 700 : 1800, 0.9);
    const bp = new Biquad(sr, 'bandpass', surface === 'metal' ? 900 + variant * 60 : 140 + variant * 15, 3);
    const heel = 0.0;
    const toe = 0.05 + rng.range(0, 0.02);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const e1 = t >= heel ? env(t - heel, 0.002, 0.025) : 0;
      const e2 = t >= toe ? env(t - toe, 0.004, surface === 'wet' ? 0.06 : 0.035) * 0.7 : 0;
      let x = lp.tick(n.white()) * (e1 + e2);
      x += bp.tick(n.white()) * (e1 * 1.8);
      if (surface === 'wet') {
        // Splash: bright, longer noise tail and a bubble blip.
        x += n.white() * env(t - toe, 0.01, 0.05) * 0.35 * (t > toe ? 1 : 0);
        if (t > toe && t < toe + 0.04) x += Math.sin(TAU * (900 - (t - toe) * 9000) * t) * 0.15;
      }
      if (surface === 'mud') x *= 1.3;
      d[i] = x;
    }
    return mono(sr, d, surface === 'mud' ? 0.45 : 0.6);
  };
}

/** Steady monsoon rain: layered filtered noise plus individual drop ticks. */
function rain(variant: 'outdoor' | 'window' | 'tin'): Recipe {
  return (sr, rng) => {
    const secs = 6;
    const L = buf(sr, secs);
    const R = buf(sr, secs);
    const nl = new Noise(new Rng(11));
    const nr = new Noise(new Rng(12));
    const lpL = new Biquad(sr, 'lowpass', variant === 'window' ? 2400 : 5200, 0.6);
    const lpR = new Biquad(sr, 'lowpass', variant === 'window' ? 2400 : 5200, 0.6);
    const hp = new Biquad(sr, 'highpass', 200, 0.7);
    const hp2 = new Biquad(sr, 'highpass', 200, 0.7);
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      const swell = 0.85 + 0.15 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
      L[i] = hp.tick(lpL.tick(nl.pink())) * swell;
      R[i] = hp2.tick(lpR.tick(nr.pink())) * swell;
    }
    // Drops.
    const drops = variant === 'tin' ? 2600 : variant === 'window' ? 600 : 1400;
    for (let k = 0; k < drops; k++) {
      const start = Math.floor(rng.next() * (L.length - sr * 0.05));
      const f = variant === 'tin' ? rng.range(2000, 5000) : rng.range(1500, 4500);
      const amp = rng.range(0.05, variant === 'tin' ? 0.5 : 0.25);
      const pan = rng.next();
      const len = Math.floor(sr * (variant === 'tin' ? 0.03 : 0.012));
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const v = Math.sin(TAU * f * t) * Math.exp(-t * (variant === 'tin' ? 140 : 380)) * amp;
        L[start + i]! += v * (1 - pan);
        R[start + i]! += v * pan;
      }
    }
    return stereo(sr, L, R, variant === 'outdoor' ? 0.7 : 0.55, true);
  };
}

const thunder =
  (close: boolean): Recipe =>
  (sr, rng) => {
    const secs = close ? 5 : 7;
    const L = buf(sr, secs);
    const R = buf(sr, secs);
    const n = new Noise(rng);
    const lp = new Biquad(sr, 'lowpass', close ? 900 : 260, 0.7);
    const lp2 = new Biquad(sr, 'lowpass', close ? 900 : 260, 0.7);
    const rumbles: { at: number; amp: number }[] = [];
    for (let i = 0; i < 7; i++) rumbles.push({ at: rng.range(0, secs * 0.6), amp: rng.range(0.3, 1) });
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      let e = env(t, close ? 0.005 : 0.25, close ? 1.6 : 2.4);
      for (const r of rumbles) if (t > r.at) e += r.amp * 0.5 * env(t - r.at, 0.08, 0.6);
      L[i] = lp.tick(n.brownN()) * e;
      R[i] = lp2.tick(n.brownN()) * e;
      if (close && t < 0.25) {
        const crack = n.white() * env(t, 0.001, 0.05);
        L[i]! += crack * 0.8;
        R[i]! += crack * 0.8;
      }
    }
    return stereo(sr, L, R, close ? 0.95 : 0.85);
  };

const windLoop: Recipe = (sr) => {
  const L = buf(sr, 8);
  const R = buf(sr, 8);
  const n = new Noise(new Rng(5));
  const bpL = new Biquad(sr, 'bandpass', 400, 1.5);
  const bpR = new Biquad(sr, 'bandpass', 460, 1.5);
  for (let i = 0; i < L.length; i++) {
    const t = i / sr;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.8) * Math.sin(t * 0.37 + 2);
    bpL.set('bandpass', 300 + gust * 500, 1.4);
    bpR.set('bandpass', 340 + gust * 480, 1.4);
    L[i] = bpL.tick(n.pink()) * (0.3 + gust);
    R[i] = bpR.tick(n.pink()) * (0.3 + gust);
  }
  return stereo(sr, L, R, 0.5, true);
};

const fanLoop: Recipe = (sr) => {
  const d = buf(sr, 3);
  const n = new Noise(new Rng(21));
  const lp = new Biquad(sr, 'lowpass', 700, 0.8);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const blade = 0.6 + 0.4 * Math.sin(TAU * 12 * t);
    d[i] = lp.tick(n.white()) * blade * 0.8 + Math.sin(TAU * 50 * t) * 0.08 + Math.sin(TAU * 100 * t) * 0.04;
    // A dry tick from a worn bearing once per revolution.
    const ph = (t * 4) % 1;
    if (ph < 0.004) d[i]! += Math.sin(TAU * 2400 * t) * 0.3;
  }
  return mono(sr, d, 0.4, true);
};

/** 100 Hz mains buzz of a fluorescent tube with ballast crackle. */
const tubeBuzz: Recipe = (sr, rng) => {
  const d = buf(sr, 2);
  const n = new Noise(rng);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let x = 0;
    for (let h = 1; h <= 8; h++) x += Math.sin(TAU * 100 * h * t + h) / (h * 1.3);
    x *= 0.4;
    if (rng.next() < 0.0006) x += n.white() * 2;
    d[i] = x;
  }
  return mono(sr, d, 0.25, true);
};

const transformerHum: Recipe = (sr) => {
  const d = buf(sr, 2);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.sin(TAU * 100 * t) * 0.6 + Math.sin(TAU * 200 * t) * 0.3 + Math.sin(TAU * 300 * t) * 0.15 + Math.sin(TAU * 50 * t) * 0.2;
  }
  return mono(sr, d, 0.35, true);
};

/** Old hinge creak: a resonant buzz with stick-slip pitch wobble. */
const creak =
  (len: number, base: number): Recipe =>
  (sr, rng) => {
    const d = buf(sr, len);
    const bp1 = new Biquad(sr, 'bandpass', 900, 8);
    const bp2 = new Biquad(sr, 'bandpass', 1900, 10);
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const wob = Math.sin(t * 13 + Math.sin(t * 3.1) * 2) * 0.35 + rng.range(-0.05, 0.05);
      const f = base * (1 + wob + (t / len) * 0.4);
      phase += f / sr;
      // Stick-slip pulses rather than a smooth oscillator.
      const pulse = phase % 1 < 0.08 ? 1 : 0;
      const e = Math.min(1, t * 8) * Math.min(1, (len - t) * 5) * (0.6 + 0.4 * Math.sin(t * 5));
      d[i] = (bp1.tick(pulse) * 2 + bp2.tick(pulse)) * e;
    }
    return mono(sr, d, 0.5);
  };

const thump =
  (low: number, decay: number, rattle: number, peak: number): Recipe =>
  (sr, rng) => {
    const d = buf(sr, decay * 6 + 0.3);
    const n = new Noise(rng);
    const lp = new Biquad(sr, 'lowpass', 1200, 0.8);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const e = env(t, 0.002, decay);
      d[i] = Math.sin(TAU * low * t * (1 - t * 0.3)) * e + lp.tick(n.white()) * e * 0.6;
      if (rattle > 0 && t > 0.02) d[i]! += n.white() * env(t - 0.02, 0.001, 0.02) * rattle * (Math.sin(t * 90) > 0.6 ? 1 : 0.1);
    }
    return mono(sr, d, peak);
  };

const latchClick: Recipe = (sr, rng) => {
  const d = buf(sr, 0.25);
  const n = new Noise(rng);
  const hp = new Biquad(sr, 'highpass', 2000, 0.7);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] =
      hp.tick(n.white()) * (env(t, 0.0005, 0.006) + (t > 0.07 ? env(t - 0.07, 0.0005, 0.008) * 0.8 : 0)) +
      Math.sin(TAU * 3200 * t) * env(t, 0.001, 0.01) * 0.3;
  }
  return mono(sr, d, 0.45);
};

const rattle: Recipe = (sr, rng) => {
  const d = buf(sr, 0.7);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 1400, 4);
  const hits = [0, 0.09, 0.17, 0.31, 0.38, 0.5];
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let e = 0;
    for (const h of hits) if (t > h) e += env(t - h, 0.001, 0.025);
    d[i] = bp.tick(n.white()) * e * 2 + Math.sin(TAU * 110 * t) * e * 0.4;
  }
  return mono(sr, d, 0.55);
};

const glassBreak: Recipe = (sr, rng) => {
  const d = buf(sr, 1.6);
  const n = new Noise(rng);
  const hp = new Biquad(sr, 'highpass', 2500, 0.8);
  const shards: { at: number; f: number; a: number }[] = [];
  for (let i = 0; i < 40; i++) shards.push({ at: rng.range(0, 0.8) ** 2, f: rng.range(2500, 9000), a: rng.range(0.1, 0.5) });
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let x = hp.tick(n.white()) * env(t, 0.001, 0.08);
    for (const s of shards) if (t > s.at) x += Math.sin(TAU * s.f * (t - s.at)) * Math.exp(-(t - s.at) * 40) * s.a;
    d[i] = x;
  }
  return mono(sr, d, 0.6);
};

const objectFall: Recipe = (sr, rng) => {
  const d = buf(sr, 1.2);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 600, 2);
  const hits = [0, 0.16, 0.27, 0.34, 0.39];
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let e = 0;
    hits.forEach((h, k) => {
      if (t > h) e += env(t - h, 0.001, 0.05) / (k + 1);
    });
    d[i] = bp.tick(n.white()) * e * 2 + Math.sin(TAU * 90 * t) * env(t, 0.002, 0.08);
  }
  return mono(sr, d, 0.6);
};

const metalClang: Recipe = (sr) => {
  const d = buf(sr, 2.5);
  const partials = [220, 563, 1011, 1490, 2310];
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let x = 0;
    partials.forEach((f, k) => (x += (Math.sin(TAU * f * t) * Math.exp(-t * (1.5 + k))) / (k + 1)));
    d[i] = x * Math.min(1, t * 2000);
  }
  return mono(sr, d, 0.6);
};

/** Whisper: noise through moving vowel formants with syllable envelopes. */
const whisper =
  (seed: number, len: number): Recipe =>
  (sr) => {
    const rng = new Rng(seed);
    const L = buf(sr, len);
    const R = buf(sr, len);
    const n = new Noise(rng);
    const f1 = new Biquad(sr, 'bandpass', 700, 6);
    const f2 = new Biquad(sr, 'bandpass', 1200, 8);
    const f3 = new Biquad(sr, 'bandpass', 2600, 8);
    const hp = new Biquad(sr, 'highpass', 400, 0.7);
    const sylls: { at: number; d: number; v: [number, number] }[] = [];
    let at = 0.1;
    const vowels: [number, number][] = [
      [700, 1200],
      [400, 2000],
      [300, 900],
      [600, 1800],
      [500, 1000],
    ];
    while (at < len - 0.3) {
      const dd = rng.range(0.12, 0.3);
      sylls.push({ at, d: dd, v: rng.pick(vowels) });
      at += dd + rng.range(0.02, 0.15);
    }
    let pan = rng.next();
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      let e = 0;
      let v: [number, number] = [600, 1400];
      for (const s of sylls) {
        if (t >= s.at && t < s.at + s.d) {
          const p = (t - s.at) / s.d;
          e = Math.sin(Math.PI * p) ** 0.6;
          v = s.v;
        }
      }
      if (i % 256 === 0) {
        f1.set('bandpass', v[0], 6);
        f2.set('bandpass', v[1], 8);
      }
      const src = hp.tick(n.white());
      const x = (f1.tick(src) * 1.4 + f2.tick(src) + f3.tick(src) * 0.6) * e;
      pan += (rng.next() - 0.5) * 0.0002;
      L[i] = x * (1 - Math.min(1, Math.max(0, pan)));
      R[i] = x * Math.min(1, Math.max(0, pan));
    }
    return stereo(sr, L, R, 0.5);
  };

/** A breath cycle (inhale + exhale); heavy = faster and rougher. */
const breathing =
  (heavy: boolean): Recipe =>
  (sr) => {
    const period = heavy ? 1.15 : 3.6;
    const cycles = heavy ? 4 : 2;
    const d = buf(sr, period * cycles);
    const n = new Noise(new Rng(heavy ? 31 : 32));
    const bp = new Biquad(sr, 'bandpass', heavy ? 1100 : 800, 1.2);
    const lp = new Biquad(sr, 'lowpass', 2500, 0.7);
    for (let i = 0; i < d.length; i++) {
      const t = (i / sr) % period;
      const inhale = t < period * 0.4 ? Math.sin((Math.PI * t) / (period * 0.4)) : 0;
      const ex = t >= period * 0.45 && t < period * 0.95 ? Math.sin((Math.PI * (t - period * 0.45)) / (period * 0.5)) : 0;
      const e = inhale * 0.6 + ex * (heavy ? 1 : 0.8);
      d[i] = lp.tick(bp.tick(n.white())) * e * (heavy ? 1.2 : 0.7);
      if (heavy && ex > 0.2 && Math.random() < 0.002) d[i]! *= 2;
    }
    return mono(sr, d, heavy ? 0.5 : 0.25, true);
  };

const heartbeat: Recipe = (sr) => {
  const d = buf(sr, 0.9);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const lub = t < 0.25 ? Math.sin(TAU * 55 * t) * env(t, 0.01, 0.06) : 0;
    const dub = t > 0.22 && t < 0.5 ? Math.sin(TAU * 48 * (t - 0.22)) * env(t - 0.22, 0.01, 0.07) * 0.7 : 0;
    d[i] = lub + dub;
  }
  return mono(sr, d, 0.8);
};

/** Low, wavering moan with detuned partials and breath noise. */
const ghostMoan: Recipe = (sr, rng) => {
  const len = 4.5;
  const d = buf(sr, len);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 500, 2);
  let ph1 = 0;
  let ph2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const f = 160 + Math.sin(t * 1.3) * 30 - t * 8 + Math.sin(t * 6.5) * 4;
    ph1 += f / sr;
    ph2 += (f * 1.503) / sr;
    const e = Math.sin((Math.PI * t) / len) ** 1.5;
    d[i] = (Math.sin(TAU * ph1) * 0.6 + Math.sin(TAU * ph2) * 0.25 + bp.tick(n.white()) * 0.8) * e;
  }
  return mono(sr, d, 0.55);
};

/** Harsh, distorted scream for attacks and jump scares. */
const ghostScream: Recipe = (sr, rng) => {
  const len = 2.0;
  const L = buf(sr, len);
  const R = buf(sr, len);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 2400, 1.5);
  const phases = [0, 0, 0, 0];
  const ratios = [1, 1.007, 1.51, 2.02];
  for (let i = 0; i < L.length; i++) {
    const t = i / sr;
    const f = 620 + Math.sin(t * 31) * 60 + t * 180 + rng.range(-20, 20);
    let x = 0;
    ratios.forEach((r, k) => {
      phases[k]! += (f * r) / sr;
      x += ((phases[k]! % 1) * 2 - 1) / (k + 1);
    });
    x += bp.tick(n.white()) * 1.5;
    x = Math.tanh(x * 2.5);
    const e = env(t, 0.01, 0.9);
    L[i] = x * e;
    R[i] = Math.tanh((x + n.white() * 0.1) * 1.1) * e;
  }
  return stereo(sr, L, R, 0.9);
};

const ghostBreath: Recipe = (sr, rng) => {
  const d = buf(sr, 2.2);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 600, 3);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const e = Math.sin((Math.PI * t) / 2.2) ** 2;
    const rasp = 0.6 + 0.4 * Math.sin(TAU * 38 * t) * Math.sin(TAU * 7 * t);
    d[i] = bp.tick(n.white()) * e * rasp;
  }
  return mono(sr, d, 0.5);
};

/** Bare, wet footstep of the ghost. */
const ghostStep: Recipe = (sr, rng) => {
  const d = buf(sr, 0.3);
  const n = new Noise(rng);
  const lp = new Biquad(sr, 'lowpass', 900, 1);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = lp.tick(n.white()) * env(t, 0.003, 0.04) + Math.sin(TAU * 70 * t) * env(t, 0.002, 0.05) * 0.8;
  }
  return mono(sr, d, 0.6);
};

const phoneVibrate: Recipe = (sr) => {
  const d = buf(sr, 1.4);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const on = (t > 0 && t < 0.45) || (t > 0.7 && t < 1.15) ? 1 : 0;
    d[i] = on * (Math.sin(TAU * 172 * t) * 0.6 + Math.sign(Math.sin(TAU * 172 * t)) * 0.3) * (0.7 + 0.3 * Math.sin(TAU * 23 * t));
  }
  return mono(sr, d, 0.55);
};

const phoneNotify: Recipe = (sr) => {
  const d = buf(sr, 0.8);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const n1 = t < 0.4 ? Math.sin(TAU * 1318 * t) * env(t, 0.005, 0.12) : 0;
    const n2 = t > 0.14 ? Math.sin(TAU * 1760 * (t - 0.14)) * env(t - 0.14, 0.005, 0.2) : 0;
    d[i] = n1 + n2;
  }
  return mono(sr, d, 0.4);
};

const staticLoop =
  (kind: 'tv' | 'radio' | 'cctv'): Recipe =>
  (sr, rng) => {
    const d = buf(sr, 3);
    const n = new Noise(rng);
    const bp = new Biquad(sr, 'bandpass', kind === 'radio' ? 1800 : 3000, kind === 'radio' ? 0.8 : 0.5);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let x = bp.tick(n.white());
      if (kind === 'radio') x += Math.sin(TAU * (600 + Math.sin(t * 2) * 300) * t) * 0.05 * (Math.sin(t * 1.7) > 0.6 ? 1 : 0);
      if (kind === 'cctv') x += Math.sin(TAU * 15734 * t) * 0.05 + (Math.sin(TAU * 60 * t) > 0.98 ? 0.4 : 0);
      if (kind === 'tv') x *= 0.9 + 0.1 * Math.sin(TAU * 50 * t);
      d[i] = x;
    }
    return mono(sr, d, kind === 'radio' ? 0.3 : 0.4, true);
  };

const drip: Recipe = (sr, rng) => {
  const d = buf(sr, 4);
  const drops = [0.3, 1.5, 2.2, 3.4].map((x) => x + rng.range(-0.1, 0.1));
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let x = 0;
    for (const s of drops) {
      if (t > s && t < s + 0.15) {
        const u = t - s;
        x += Math.sin(TAU * (1400 + u * 6000) * u) * Math.exp(-u * 45);
      }
    }
    d[i] = x;
  }
  return mono(sr, d, 0.4, true);
};

const liftDoor: Recipe = (sr, rng) => {
  const d = buf(sr, 1.6);
  const n = new Noise(rng);
  const lp = new Biquad(sr, 'lowpass', 400, 0.9);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const e = Math.min(1, t * 6) * Math.min(1, (1.6 - t) * 4);
    d[i] = lp.tick(n.white()) * e * (0.7 + 0.3 * Math.sin(t * 40)) + (t > 1.45 ? Math.sin(TAU * 120 * t) * env(t - 1.45, 0.002, 0.04) : 0);
  }
  return mono(sr, d, 0.5);
};

const liftMotor: Recipe = (sr, rng) => {
  const d = buf(sr, 3);
  const n = new Noise(rng);
  const lp = new Biquad(sr, 'lowpass', 300, 0.8);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] =
      Math.sin(TAU * 75 * t) * 0.4 +
      Math.sin(TAU * 150 * t) * 0.2 +
      lp.tick(n.white()) * 0.8 +
      (Math.sin(TAU * 1.5 * t) > 0.97 ? n.white() * 0.3 : 0);
  }
  return mono(sr, d, 0.4, true);
};

const bell =
  (freqs: number[], decay: number, peak: number): Recipe =>
  (sr) => {
    const d = buf(sr, decay * 4);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      let x = 0;
      freqs.forEach((f, k) => {
        x += (Math.sin(TAU * f * t) * Math.exp(-t / (decay / (1 + k * 0.3)))) / (k + 1);
        x += Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / (decay * 0.3)) * 0.15;
      });
      d[i] = x * Math.min(1, t * 500);
    }
    return mono(sr, d, peak);
  };

const sparks: Recipe = (sr, rng) => {
  const d = buf(sr, 0.9);
  const n = new Noise(rng);
  const hp = new Biquad(sr, 'highpass', 1500, 0.7);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const crackle = rng.next() < 0.02 * Math.exp(-t * 3) ? rng.range(0.5, 1) : 0;
    d[i] = hp.tick(n.white()) * (crackle * 3 + env(t, 0.001, 0.05) * 0.8) + Math.sin(TAU * 100 * t) * env(t, 0.001, 0.2) * 0.5;
  }
  return mono(sr, d, 0.6);
};

const powerSweep =
  (up: boolean): Recipe =>
  (sr) => {
    const len = 2.4;
    const d = buf(sr, len);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const p = t / len;
      const f = up ? 40 + p * 80 : 120 - p * 90;
      ph += f / sr;
      const e = up ? Math.min(1, t * 3) * (1 - p * 0.5) : 1 - p;
      d[i] = (Math.sin(TAU * ph) + Math.sin(TAU * ph * 2) * 0.4) * e;
    }
    return mono(sr, d, 0.5);
  };

const breaker: Recipe = (sr, rng) => {
  const d = buf(sr, 0.4);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 900, 2);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = bp.tick(n.white()) * env(t, 0.001, 0.02) * 2 + Math.sin(TAU * 140 * t) * env(t, 0.001, 0.05);
  }
  return mono(sr, d, 0.6);
};

const pageTurn: Recipe = (sr, rng) => {
  const d = buf(sr, 0.5);
  const n = new Noise(rng);
  const hp = new Biquad(sr, 'highpass', 1800, 0.6);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const e = Math.sin((Math.PI * t) / 0.5) ** 2 * (0.6 + 0.4 * Math.sin(t * 80));
    d[i] = hp.tick(n.white()) * e;
  }
  return mono(sr, d, 0.35);
};

const pickup: Recipe = (sr, rng) => {
  const d = buf(sr, 0.35);
  const n = new Noise(rng);
  const bp = new Biquad(sr, 'bandpass', 2200, 3);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = bp.tick(n.white()) * (env(t, 0.001, 0.02) + (t > 0.08 ? env(t - 0.08, 0.001, 0.03) * 0.7 : 0));
  }
  return mono(sr, d, 0.4);
};

const uiClick: Recipe = (sr) => {
  const d = buf(sr, 0.08);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.sin(TAU * 1800 * t) * env(t, 0.0005, 0.01) + Math.sin(TAU * 600 * t) * env(t, 0.0005, 0.02) * 0.5;
  }
  return mono(sr, d, 0.3);
};

const stinger: Recipe = (sr, rng) => {
  // Dissonant orchestral hit for jump scares.
  const len = 3;
  const L = buf(sr, len);
  const R = buf(sr, len);
  const n = new Noise(rng);
  const freqs = [55, 58.3, 82.4, 116.5, 233, 246.9, 466];
  const ph = freqs.map(() => 0);
  for (let i = 0; i < L.length; i++) {
    const t = i / sr;
    let x = 0;
    freqs.forEach((f, k) => {
      ph[k]! += (f * (1 + Math.sin(t * 5 + k) * 0.003)) / sr;
      x += ((ph[k]! % 1) * 2 - 1) * (k < 3 ? 0.6 : 0.3);
    });
    x = Math.tanh(x * 1.5) * env(t, 0.004, 1.2) + n.white() * env(t, 0.001, 0.1) * 0.8;
    L[i] = x;
    R[i] = x * 0.9 + n.white() * env(t, 0.001, 0.2) * 0.1;
  }
  return stereo(sr, L, R, 0.9);
};

/** Music beds: long, sparse loops that the audio system crossfades between. */
const music =
  (kind: 'normal' | 'tension' | 'chase' | 'discovery' | 'ending'): Recipe =>
  (sr, rng) => {
    const len = kind === 'chase' ? 8 : 16;
    const L = buf(sr, len);
    const R = buf(sr, len);
    const n = new Noise(rng);
    const lp = new Biquad(sr, 'lowpass', 300, 0.7);
    const lp2 = new Biquad(sr, 'lowpass', 300, 0.7);
    const chords: Record<typeof kind, number[]> = {
      normal: [36.7, 55, 73.4],
      tension: [41.2, 43.65, 61.7, 87.3, 92.5],
      chase: [36.7, 38.9, 55, 77.8],
      discovery: [146.8, 220, 277.2, 329.6],
      ending: [110, 164.8, 220, 261.6, 329.6],
    };
    const fs = chords[kind];
    const ph = fs.map(() => rng.next());
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      let x = 0;
      fs.forEach((f, k) => {
        const det = 1 + Math.sin(t * (0.21 + k * 0.07) + k) * (kind === 'tension' ? 0.012 : 0.004);
        ph[k]! += (f * det) / sr;
        const w =
          kind === 'discovery' || kind === 'ending' ? Math.sin(TAU * ph[k]!) : Math.sin(TAU * ph[k]!) + Math.sin(TAU * ph[k]! * 2) * 0.3;
        x += w * (0.5 + 0.5 * Math.sin(t * 0.3 + k * 1.7));
      });
      x /= fs.length;
      let y = x;
      if (kind === 'chase') {
        const beat = (t * 2.4) % 1;
        y = x * 0.6 + Math.sin(TAU * 50 * t) * Math.exp(-beat * 9) * 1.4 + lp.tick(n.white()) * Math.exp(-((t * 4.8) % 1) * 18) * 0.8;
        if ((t * 0.5) % 1 > 0.85) y += Math.sin(TAU * (1800 + Math.sin(t * 40) * 200) * t) * 0.08;
      } else if (kind === 'tension') {
        const pulse = Math.exp(-((t * 0.9) % 1) * 6);
        y = x + Math.sin(TAU * 41 * t) * pulse * 0.6 + lp2.tick(n.white()) * 0.15;
      } else if (kind === 'normal') {
        y = x * 0.8 + lp2.tick(n.white()) * 0.1;
      } else if (kind === 'discovery') {
        const strike = Math.exp(-(t % 4) * 1.2);
        y = x * (0.3 + strike * 0.7);
      }
      L[i] = y;
      R[i] = kind === 'chase' ? y : x * 0.9 + (y - x);
    }
    return stereo(sr, L, R, kind === 'chase' ? 0.65 : 0.5, true);
  };

export const SOUNDS: Record<string, Recipe> = {
  ...Object.fromEntries(
    (['tile', 'concrete', 'wet', 'metal', 'mud'] as const).flatMap((s) =>
      [0, 1, 2, 3].map((v) => [`step_${s}_${v}`, footstep(s, v + (s === 'tile' ? 0 : 7))]),
    ),
  ),
  rainOutdoor: rain('outdoor'),
  rainWindow: rain('window'),
  rainTin: rain('tin'),
  thunder: thunder(false),
  thunderClose: thunder(true),
  wind: windLoop,
  fan: fanLoop,
  tubeBuzz,
  transformerHum,
  doorOpen: creak(1.3, 18),
  doorClose: creak(0.9, 22),
  creakLong: creak(2.6, 12),
  doorLatch: latchClick,
  doorSlam: thump(55, 0.18, 0.8, 0.95),
  doorRattle: rattle,
  unlock: latchClick,
  glassBreak,
  objectFall,
  metalClang,
  whisper0: whisper(1, 2.2),
  whisper1: whisper(2, 1.6),
  whisper2: whisper(3, 2.8),
  whisper3: whisper(4, 1.9),
  breathing: breathing(false),
  breathingHeavy: breathing(true),
  heartbeat,
  ghostMoan,
  ghostScream,
  ghostBreath,
  ghostStep,
  phoneVibrate,
  phoneNotify,
  tvStatic: staticLoop('tv'),
  radioStatic: staticLoop('radio'),
  cctvStatic: staticLoop('cctv'),
  drip,
  liftDoor,
  liftStart: thump(40, 0.25, 0.3, 0.7),
  liftMotor,
  liftDing: bell([880], 0.5, 0.35),
  sparks,
  powerDown: powerSweep(false),
  powerUp: powerSweep(true),
  breaker,
  switchClick: latchClick,
  pageTurn,
  pickup,
  uiClick,
  stinger,
  knock: thump(90, 0.06, 0, 0.7),
  templeBell: bell([523, 1046], 1.2, 0.4),
  musicNormal: music('normal'),
  musicTension: music('tension'),
  musicChase: music('chase'),
  musicDiscovery: music('discovery'),
  musicEnding: music('ending'),
};

export function renderSound(name: string, sampleRate: number): Rendered {
  const r = SOUNDS[name];
  if (!r) throw new Error(`Unknown sound ${name}`);
  return r(sampleRate, new Rng(name.length * 7919 + name.charCodeAt(0)));
}

/** Exponentially decaying stereo noise impulse response for the convolution reverb. */
export function impulseResponse(sr: number, seconds: number, decay: number): Float32Array[] {
  const rng = new Rng(77);
  const L = buf(sr, seconds);
  const R = buf(sr, seconds);
  for (let i = 0; i < L.length; i++) {
    const t = i / L.length;
    const e = Math.pow(1 - t, decay);
    L[i] = (rng.next() * 2 - 1) * e;
    R[i] = (rng.next() * 2 - 1) * e;
  }
  return [L, R];
}
