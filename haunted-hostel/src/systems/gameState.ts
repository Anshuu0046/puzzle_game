import { bus } from '../core/events';

/**
 * Central, serialisable game state: inventory, story flags, chapter/objective progress, door and
 * puzzle states. Systems read and mutate it; the save system snapshots it.
 */
export interface SaveData {
  version: 1;
  savedAt: number;
  chapter: number;
  objective: string;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: string[];
  usedItems: string[];
  flags: string[];
  doors: Record<string, { open: boolean; locked: boolean }>;
  puzzles: Record<string, unknown>;
  evidence: string[];
  documents: string[];
  phone: { messages: { from: string; text: string; time: string }[]; battery: number };
  flashlightBattery: number;
  batteries: number;
  lift: string;
  power: Record<string, boolean>;
  ending: string | null;
  playTime: number;
  scaresUsed: string[];
}

class GameState {
  chapter = 1;
  objective = '';
  inventory: string[] = [];
  usedItems = new Set<string>();
  flags = new Set<string>();
  evidence = new Set<string>();
  documents: string[] = [];
  puzzles: Record<string, unknown> = {};
  ending: string | null = null;
  playTime = 0;
  scaresUsed = new Set<string>();
  batteries = 0;

  reset(): void {
    this.chapter = 1;
    this.objective = '';
    this.inventory = [];
    this.usedItems.clear();
    this.flags.clear();
    this.evidence.clear();
    this.documents = [];
    this.puzzles = {};
    this.ending = null;
    this.playTime = 0;
    this.scaresUsed.clear();
    this.batteries = 0;
  }

  has(item: string): boolean {
    return this.inventory.includes(item);
  }

  give(item: string, silent = false): void {
    if (this.inventory.includes(item)) return;
    this.inventory.push(item);
    if (!silent) bus.emit('itemAdded', { id: item });
  }

  take(item: string): void {
    const i = this.inventory.indexOf(item);
    if (i >= 0) this.inventory.splice(i, 1);
    this.usedItems.add(item);
  }

  flag(name: string): boolean {
    return this.flags.has(name);
  }

  set(name: string): void {
    if (this.flags.has(name)) return;
    this.flags.add(name);
    bus.emit('flag', { name });
  }

  addDocument(id: string): void {
    if (!this.documents.includes(id)) this.documents.push(id);
  }
}

export const state = new GameState();
