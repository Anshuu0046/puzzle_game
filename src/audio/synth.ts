/**
 * Tiny offline synthesizer. Every sound in the game is rendered from code into PCM samples, so there
 * are no audio files to host. Pure functions: no DOM, safe to unit-test.
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise';

export interface Tone {
  /** Start frequency in Hz (ignored for noise). */
  readonly freq: number;
  /** End frequency for an exponential glide. */
  readonly freqEnd?: number;
  readonly wave: Wave;
  /** Start time in seconds. */
  readonly at: number;
  readonly dur: number;
  /** Peak amplitude 0..1. */
  readonly gain: number;
  /** Attack time in seconds (default 5 ms). */
  readonly attack?: number;
  /** 'exp' decays quickly after the attack (plucks, hits); 'hold' sustains then fades (pads). */
  readonly shape?: 'exp' | 'hold';
  /** Vibrato depth in semitones. */
  readonly vibrato?: number;
}

export const NOTE = (semitonesFromA4: number): number => 440 * 2 ** (semitonesFromA4 / 12);

/** MIDI note number → Hz. */
export const midi = (n: number): number => NOTE(n - 69);

function oscillator(wave: Wave, phase: number, noise: () => number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return 1 - 4 * Math.abs(p - 0.5);
    case 'square':
      return p < 0.5 ? 0.6 : -0.6;
    case 'saw':
      return (2 * p - 1) * 0.6;
    case 'noise':
      return noise();
  }
}

/** Mixes tones into a mono buffer. Output is soft-clipped and peak-normalized to `peak`. */
export function render(tones: readonly Tone[], sampleRate: number, opts: { length?: number; peak?: number } = {}): Float32Array {
  const end = opts.length ?? Math.max(0, ...tones.map((t) => t.at + t.dur)) + 0.02;
  const out = new Float32Array(Math.max(1, Math.ceil(end * sampleRate)));
  let seed = 0x2f6b1d;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };

  for (const t of tones) {
    const start = Math.floor(t.at * sampleRate);
    const count = Math.floor(t.dur * sampleRate);
    const attack = Math.max(1, Math.floor((t.attack ?? 0.005) * sampleRate));
    const f1 = t.freqEnd ?? t.freq;
    let phase = 0;
    for (let i = 0; i < count && start + i < out.length; i++) {
      const k = i / count;
      const freq = t.freq * (f1 / t.freq) ** k;
      const vib = t.vibrato ? 2 ** ((t.vibrato * Math.sin(2 * Math.PI * 5.5 * (i / sampleRate))) / 12) : 1;
      phase += (freq * vib) / sampleRate;
      let env = i < attack ? i / attack : 1;
      if (i >= attack) {
        const r = (i - attack) / Math.max(1, count - attack);
        env = t.shape === 'hold' ? Math.min(1, (1 - r) * 4) : Math.exp(-5 * r) * (1 - r);
      }
      out[start + i]! += oscillator(t.wave, phase, noise) * env * t.gain;
    }
  }

  let max = 0;
  for (let i = 0; i < out.length; i++) {
    const v = Math.tanh(out[i]!);
    out[i] = v;
    max = Math.max(max, Math.abs(v));
  }
  const peak = opts.peak ?? 0.9;
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i]! / max) * peak;
  return out;
}
