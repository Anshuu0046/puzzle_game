import { storage } from '../core/storage';
import type { SaveData } from './gameState';

const AUTO = 'hh.save.auto.v1';
const MANUAL = 'hh.save.manual.v1';

/** Two slots: the rolling checkpoint autosave and the manual journal save. */
export const saves = {
  write(data: SaveData, manual: boolean): boolean {
    return storage.set(manual ? MANUAL : AUTO, data);
  },
  latest(): SaveData | null {
    const a = storage.get<SaveData | null>(AUTO, null);
    const m = storage.get<SaveData | null>(MANUAL, null);
    const valid = [a, m].filter((s): s is SaveData => !!s && s.version === 1 && typeof s.chapter === 'number');
    if (!valid.length) return null;
    return valid.sort((x, y) => y.savedAt - x.savedAt)[0]!;
  },
  clear(): void {
    storage.remove(AUTO);
    storage.remove(MANUAL);
  },
  describe(s: SaveData): string {
    const mins = Math.floor(s.playTime / 60);
    return `Chapter ${['I', 'II', 'III', 'IV', 'V'][s.chapter - 1] ?? s.chapter} · ${mins} min · ${new Date(s.savedAt).toLocaleString()}`;
  },
};
