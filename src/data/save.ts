/** Player progress and settings, persisted to localStorage. Every storage access is guarded. */

export interface LevelRecord {
  readonly stars: number;
  readonly best: number;
}

export interface Settings {
  readonly sfx: boolean;
  readonly music: boolean;
}

export interface SaveData {
  readonly version: 1;
  readonly levels: Readonly<Record<string, LevelRecord>>;
  readonly settings: Settings;
}

/** The subset of Web Storage we use; injectable for tests. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'sugar-bloom:save';

const DEFAULTS: SaveData = { version: 1, levels: {}, settings: { sfx: true, music: true } };

/** localStorage if it works (it throws in some private modes and sandboxed frames), else null. */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__sugar-bloom-probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Accepts only well-formed data; anything unexpected falls back to defaults field by field. */
export function sanitize(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return DEFAULTS;
  const r = raw as { levels?: unknown; settings?: unknown };
  const levels: Record<string, LevelRecord> = {};
  if (typeof r.levels === 'object' && r.levels !== null) {
    for (const [id, rec] of Object.entries(r.levels as Record<string, unknown>)) {
      const { stars, best } = (rec ?? {}) as { stars?: unknown; best?: unknown };
      if (!/^\d+$/.test(id) || typeof stars !== 'number' || typeof best !== 'number') continue;
      if (!Number.isFinite(stars) || !Number.isFinite(best)) continue;
      levels[id] = { stars: Math.max(0, Math.min(3, Math.floor(stars))), best: Math.max(0, Math.floor(best)) };
    }
  }
  const s = (typeof r.settings === 'object' && r.settings !== null ? r.settings : {}) as { sfx?: unknown; music?: unknown };
  return {
    version: 1,
    levels,
    settings: {
      sfx: typeof s.sfx === 'boolean' ? s.sfx : DEFAULTS.settings.sfx,
      music: typeof s.music === 'boolean' ? s.music : DEFAULTS.settings.music,
    },
  };
}

export class SaveStore {
  private state: SaveData;

  constructor(
    private readonly storage: KeyValueStore | null,
    private readonly levelCount: number,
  ) {
    this.state = this.load();
  }

  get data(): SaveData {
    return this.state;
  }

  get settings(): Settings {
    return this.state.settings;
  }

  record(levelId: number): LevelRecord | undefined {
    return this.state.levels[String(levelId)];
  }

  /** Highest level the player may start: one past the furthest level cleared. */
  get unlockedUpTo(): number {
    const cleared = Object.entries(this.state.levels)
      .filter(([, r]) => r.stars > 0)
      .map(([id]) => Number(id));
    return Math.min(this.levelCount, Math.max(0, ...cleared) + 1);
  }

  get totalStars(): number {
    return Object.values(this.state.levels).reduce((sum, r) => sum + r.stars, 0);
  }

  /** Stores a finished level, keeping the best score and stars. Returns what improved. */
  recordResult(levelId: number, score: number, stars: number): { newBest: boolean; moreStars: boolean } {
    const prev = this.record(levelId);
    const newBest = !prev || score > prev.best;
    const moreStars = !prev || stars > prev.stars;
    if (newBest || moreStars) {
      this.state = {
        ...this.state,
        levels: { ...this.state.levels, [levelId]: { stars: Math.max(stars, prev?.stars ?? 0), best: Math.max(score, prev?.best ?? 0) } },
      };
      this.persist();
    }
    return { newBest: newBest && !!prev, moreStars };
  }

  setSettings(patch: Partial<Settings>): void {
    this.state = { ...this.state, settings: { ...this.state.settings, ...patch } };
    this.persist();
  }

  reset(): void {
    this.state = DEFAULTS;
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      // Storage unavailable: progress simply stays in memory.
    }
  }

  private load(): SaveData {
    try {
      const text = this.storage?.getItem(SAVE_KEY);
      return text ? sanitize(JSON.parse(text)) : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota exceeded or storage blocked: keep playing with in-memory progress.
    }
  }
}
