import { type Tone, midi } from './synth';

/** Sound effect names used by the game. */
export type SfxName =
  | 'swap'
  | 'invalid'
  | 'match'
  | 'special'
  | 'line'
  | 'burst'
  | 'prism'
  | 'bigCombo'
  | 'shuffle'
  | 'win'
  | 'lose'
  | 'button'
  | 'star';

const chime = (note: number, at: number, gain: number, dur = 0.3): Tone[] => [
  { freq: midi(note), wave: 'sine', at, dur, gain },
  { freq: midi(note + 12), wave: 'triangle', at, dur: dur * 0.6, gain: gain * 0.25 },
];

/** Every sound effect, as a recipe of tones. */
export const SFX: Record<SfxName, () => Tone[]> = {
  swap: () => [
    { freq: 420, freqEnd: 760, wave: 'triangle', at: 0, dur: 0.09, gain: 0.5 },
    { freq: 1200, freqEnd: 1600, wave: 'sine', at: 0.02, dur: 0.05, gain: 0.15 },
  ],
  invalid: () => [
    { freq: 240, freqEnd: 200, wave: 'triangle', at: 0, dur: 0.09, gain: 0.6 },
    { freq: 190, freqEnd: 160, wave: 'triangle', at: 0.1, dur: 0.12, gain: 0.55 },
  ],
  // Pitched up per cascade with the player's playback rate.
  match: () => [...chime(76, 0, 0.6, 0.35), ...chime(83, 0.035, 0.35, 0.3), { freq: 3000, wave: 'noise', at: 0, dur: 0.03, gain: 0.08 }],
  special: () => [72, 76, 79, 84, 88].flatMap((n, i) => chime(n, i * 0.045, 0.45, 0.28)),
  line: () => [
    { freq: 300, freqEnd: 2200, wave: 'saw', at: 0, dur: 0.22, gain: 0.35 },
    { freq: 0, wave: 'noise', at: 0, dur: 0.2, gain: 0.18 },
    { freq: 1800, freqEnd: 900, wave: 'sine', at: 0.05, dur: 0.2, gain: 0.25 },
  ],
  burst: () => [
    { freq: 160, freqEnd: 40, wave: 'sine', at: 0, dur: 0.45, gain: 1 },
    { freq: 0, wave: 'noise', at: 0, dur: 0.3, gain: 0.45 },
    { freq: 90, freqEnd: 50, wave: 'triangle', at: 0.02, dur: 0.3, gain: 0.4 },
  ],
  prism: () =>
    [84, 88, 91, 96, 91, 95, 100, 103].flatMap((n, i) => [{ freq: midi(n), wave: 'sine' as const, at: i * 0.05, dur: 0.4, gain: 0.35, vibrato: 0.15 }]),
  bigCombo: () => [
    ...[60, 64, 67, 72, 76, 79, 84].flatMap((n, i) => chime(n, i * 0.05, 0.4, 0.5)),
    { freq: 120, freqEnd: 45, wave: 'sine', at: 0, dur: 0.5, gain: 0.8 },
  ],
  shuffle: () => [
    { freq: 300, freqEnd: 900, wave: 'triangle', at: 0, dur: 0.25, gain: 0.35 },
    { freq: 900, freqEnd: 400, wave: 'triangle', at: 0.22, dur: 0.25, gain: 0.3 },
  ],
  win: () => [
    ...[72, 76, 79, 84].flatMap((n, i) => chime(n, i * 0.12, 0.5, 0.5)),
    ...[72, 76, 79, 88].map((n): Tone => ({ freq: midi(n), wave: 'triangle', at: 0.5, dur: 1.2, gain: 0.22, shape: 'hold', attack: 0.02 })),
  ],
  lose: () => [67, 64, 60, 55].map((n, i): Tone => ({ freq: midi(n), wave: 'triangle', at: i * 0.22, dur: 0.4, gain: 0.45, vibrato: 0.1 })),
  button: () => [{ freq: 660, freqEnd: 990, wave: 'sine', at: 0, dur: 0.07, gain: 0.5 }],
  star: () => [...chime(88, 0, 0.5, 0.4), ...chime(95, 0.06, 0.35, 0.4)],
};

export const MUSIC_BPM = 96;
const BEAT = 60 / MUSIC_BPM;
const BAR = BEAT * 4;
/** Chord roots and tones (MIDI) for I–vi–IV–V in C. */
const CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];
/** Eighth-note arpeggio pattern over chord tones (index into [root, third, fifth, octave...]). */
const ARP_A = [0, 1, 2, 3, 2, 1, 2, 3];
const ARP_B = [3, 2, 4, 3, 1, 2, 0, 1];

export const MUSIC_BARS = 8;
export const MUSIC_LENGTH = MUSIC_BARS * BAR;

/** A gentle, loopable 8-bar garden tune: soft pad, round bass, music-box arpeggio, light shaker. */
export function musicTones(): Tone[] {
  const tones: Tone[] = [];
  for (let bar = 0; bar < MUSIC_BARS; bar++) {
    const chord = CHORDS[bar % CHORDS.length]!;
    const t0 = bar * BAR;
    for (const n of chord) {
      tones.push({ freq: midi(n), wave: 'triangle', at: t0, dur: BAR, gain: 0.07, shape: 'hold', attack: 0.35 });
    }
    for (const beat of [0, 2]) {
      tones.push({ freq: midi(chord[0]! - 12), wave: 'sine', at: t0 + beat * BEAT, dur: BEAT * 1.6, gain: 0.3 });
    }
    const ladder = [...chord.map((n) => n + 12), chord[0]! + 24, chord[1]! + 24];
    const pattern = bar >= 4 ? ARP_B : ARP_A;
    pattern.forEach((idx, i) => {
      const at = t0 + (i * BEAT) / 2;
      tones.push({ freq: midi(ladder[idx]!), wave: 'sine', at, dur: 0.45, gain: 0.13 });
      tones.push({ freq: midi(ladder[idx]! + 12), wave: 'triangle', at, dur: 0.2, gain: 0.025 });
    });
    for (let i = 0; i < 4; i++) {
      tones.push({ freq: 0, wave: 'noise', at: t0 + i * BEAT + BEAT / 2, dur: 0.035, gain: 0.03 });
    }
  }
  return tones;
}
