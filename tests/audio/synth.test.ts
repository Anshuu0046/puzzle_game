import { describe, expect, it } from 'vitest';
import { MUSIC_LENGTH, SFX, type SfxName, musicTones } from '../../src/audio/sounds';
import { midi, render } from '../../src/audio/synth';
import { encodeWav } from '../../src/audio/wav';

describe('synth', () => {
  it('renders every sound effect as a short, normalized, non-silent buffer', () => {
    for (const name of Object.keys(SFX) as SfxName[]) {
      const samples = render(SFX[name](), 44100);
      const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak, name).toBeGreaterThan(0.5);
      expect(peak, name).toBeLessThanOrEqual(0.9 + 1e-6);
      expect(samples.length / 44100, name).toBeLessThan(2);
      expect(samples.every(Number.isFinite), name).toBe(true);
    }
  });

  it('is deterministic', () => {
    const a = render(SFX.burst(), 22050);
    const b = render(SFX.burst(), 22050);
    expect(a).toEqual(b);
  });

  it('respects a fixed length', () => {
    expect(render(musicTones(), 8000, { length: MUSIC_LENGTH }).length).toBe(Math.ceil(MUSIC_LENGTH * 8000));
  });

  it('maps MIDI notes to frequencies', () => {
    expect(midi(69)).toBeCloseTo(440);
    expect(midi(60)).toBeCloseTo(261.63, 1);
  });

  it('keeps the music loop within its length', () => {
    const tones = musicTones();
    expect(tones.length).toBeGreaterThan(50);
    expect(Math.min(...tones.map((t) => t.at))).toBe(0);
    expect(Math.max(...tones.map((t) => t.at))).toBeLessThan(MUSIC_LENGTH);
  });
});

describe('wav encoder', () => {
  it('writes a valid 16-bit mono PCM header and clamps samples', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 22050);
    const view = new DataView(bytes.buffer);
    const text = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(text(36)).toBe('data');
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });
});
