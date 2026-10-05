import type * as THREE from 'three';

/** Game-wide event map. Systems communicate through this bus instead of importing each other. */
export interface GameEvents {
  /** One-shot sound effect; `pos` makes it positional. */
  sfx: { name: string; pos?: THREE.Vector3; volume?: number; rate?: number };
  /** A noise the ghost can hear (loudness 0..1 ≈ audible radius / 25 m). */
  noise: { pos: THREE.Vector3; loudness: number; kind: string };
  subtitle: { text: string; duration?: number; speaker?: string };
  toast: { text: string; duration?: number };
  objective: { text: string };
  phoneMessage: { from: string; text: string };
  itemAdded: { id: string };
  doorOpened: { id: string };
  flag: { name: string };
  scare: { kind: string };
  vibrate: { ms: number | number[] };
  musicState: { state: 'NORMAL' | 'TENSION' | 'CHASE' | 'DISCOVERY' | 'ENDING' | 'SILENT' };
}

type Handler<T> = (payload: T) => void;

class Bus {
  private readonly map = new Map<string, Handler<unknown>[]>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let list = this.map.get(type);
    if (!list) this.map.set(type, (list = []));
    list.push(fn as Handler<unknown>);
    return () => {
      const l = this.map.get(type);
      if (l) l.splice(l.indexOf(fn as Handler<unknown>), 1);
    };
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const list = this.map.get(type);
    if (!list) return;
    for (const fn of [...list]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`Event handler for ${type} failed`, err);
      }
    }
  }
}

export const bus = new Bus();
