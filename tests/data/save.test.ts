import { describe, expect, it } from 'vitest';
import { type KeyValueStore, SAVE_KEY, SaveStore, sanitize } from '../../src/data/save';

class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const throwing: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('save', () => {
  it('starts fresh with level 1 unlocked and sound on', () => {
    const save = new SaveStore(new MemoryStore(), 30);
    expect(save.unlockedUpTo).toBe(1);
    expect(save.totalStars).toBe(0);
    expect(save.settings).toEqual({ sfx: true, music: true });
  });

  it('records results, keeps the best, and unlocks the next level', () => {
    const storage = new MemoryStore();
    const save = new SaveStore(storage, 30);
    expect(save.recordResult(1, 5000, 2)).toEqual({ newBest: false, moreStars: true });
    expect(save.unlockedUpTo).toBe(2);
    expect(save.recordResult(1, 4000, 1)).toEqual({ newBest: false, moreStars: false });
    expect(save.record(1)).toEqual({ stars: 2, best: 5000 });
    expect(save.recordResult(1, 9000, 3)).toEqual({ newBest: true, moreStars: true });
    expect(save.totalStars).toBe(3);

    const reloaded = new SaveStore(storage, 30);
    expect(reloaded.record(1)).toEqual({ stars: 3, best: 9000 });
    expect(reloaded.unlockedUpTo).toBe(2);
  });

  it('a lost level (0 stars) does not unlock the next one', () => {
    const save = new SaveStore(new MemoryStore(), 30);
    save.recordResult(1, 800, 0);
    expect(save.unlockedUpTo).toBe(1);
  });

  it('never unlocks past the last level', () => {
    const save = new SaveStore(new MemoryStore(), 3);
    save.recordResult(3, 100, 1);
    expect(save.unlockedUpTo).toBe(3);
  });

  it('persists settings', () => {
    const storage = new MemoryStore();
    new SaveStore(storage, 30).setSettings({ music: false });
    expect(new SaveStore(storage, 30).settings).toEqual({ sfx: true, music: false });
  });

  it('survives storage that throws on every call', () => {
    const save = new SaveStore(throwing, 30);
    expect(() => save.recordResult(1, 100, 1)).not.toThrow();
    expect(save.unlockedUpTo).toBe(2);
    expect(() => save.reset()).not.toThrow();
  });

  it('works with no storage at all', () => {
    const save = new SaveStore(null, 30);
    save.recordResult(1, 100, 3);
    expect(save.totalStars).toBe(3);
  });

  it('ignores corrupt JSON', () => {
    const storage = new MemoryStore();
    storage.setItem(SAVE_KEY, '{not json');
    expect(new SaveStore(storage, 30).unlockedUpTo).toBe(1);
  });

  it('sanitizes tampered or foreign data', () => {
    expect(sanitize(null).levels).toEqual({});
    expect(sanitize({ version: 2, levels: { 1: { stars: 3, best: 1 } } }).levels).toEqual({});
    const s = sanitize({
      version: 1,
      levels: { 1: { stars: 99, best: 10.7 }, x: { stars: 1, best: 1 }, 2: { stars: 'a', best: 1 }, 3: null, 4: { stars: NaN, best: 1 } },
      settings: { sfx: 'yes', music: false },
    });
    expect(s.levels).toEqual({ 1: { stars: 3, best: 10 } });
    expect(s.settings).toEqual({ sfx: true, music: false });
  });
});
