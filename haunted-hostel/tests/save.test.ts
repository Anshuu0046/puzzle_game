import { beforeEach, describe, expect, it } from 'vitest';
import { saves } from '../src/systems/save';
import type { SaveData } from '../src/systems/gameState';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const data = (chapter: number, savedAt: number): SaveData => ({
  version: 1,
  savedAt,
  chapter,
  objective: 'obj.enter',
  player: { x: 1, y: 0, z: 2, yaw: 0, pitch: 0 },
  inventory: ['key_214'],
  usedItems: [],
  flags: ['power'],
  doors: { room214: { open: true, locked: false } },
  puzzles: {},
  evidence: [],
  documents: [],
  phone: { messages: [], battery: 0.6 },
  flashlightBattery: 0.8,
  batteries: 1,
  lift: 'G',
  power: { GF: true },
  ending: null,
  playTime: 125,
  scaresUsed: [],
});

describe('save slots', () => {
  beforeEach(() => mem.clear());
  it('returns the most recent of autosave and manual save', () => {
    saves.write(data(2, 1000), false);
    saves.write(data(3, 2000), true);
    expect(saves.latest()?.chapter).toBe(3);
    saves.write(data(4, 3000), false);
    expect(saves.latest()?.chapter).toBe(4);
  });
  it('round-trips the full snapshot', () => {
    saves.write(data(2, 1000), false);
    const s = saves.latest()!;
    expect(s.doors.room214).toEqual({ open: true, locked: false });
    expect(s.inventory).toEqual(['key_214']);
    expect(saves.describe(s)).toContain('Chapter II');
  });
  it('ignores corrupt data and clears', () => {
    mem.set('hh.save.auto.v1', '{not json');
    expect(saves.latest()).toBeNull();
    saves.write(data(1, 5), false);
    saves.clear();
    expect(saves.latest()).toBeNull();
  });
});
