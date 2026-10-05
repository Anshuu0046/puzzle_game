import type { Circuit } from '../world/context';

/** Global electrical state: which circuits are live. The lighting system and props read it. */
class PowerGrid {
  private readonly state: Record<Circuit, boolean> = {
    GF: false,
    FF: false,
    SF: false,
    EXT: true,
    EMERGENCY: false,
    BATTERY: true,
    STREET: true,
  };
  private readonly listeners: ((c: Circuit, on: boolean) => void)[] = [];

  on(c: Circuit): boolean {
    return this.state[c];
  }

  set(c: Circuit, on: boolean): void {
    if (this.state[c] === on) return;
    this.state[c] = on;
    for (const l of this.listeners) l(c, on);
  }

  subscribe(fn: (c: Circuit, on: boolean) => void): void {
    this.listeners.push(fn);
  }

  snapshot(): Record<Circuit, boolean> {
    return { ...this.state };
  }

  restore(s: Partial<Record<Circuit, boolean>>): void {
    for (const [k, v] of Object.entries(s)) this.set(k as Circuit, !!v);
  }
}

export const power = new PowerGrid();

export const circuitForFloor = (floor: number): Circuit => (floor <= 0 ? 'GF' : floor === 1 ? 'FF' : 'SF');
