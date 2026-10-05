/** Pure puzzle logic (UI-free, unit tested). */

export type BreakerId = 'MAIN' | '1' | '2' | '3' | 'PUMP';
export const BREAKERS: BreakerId[] = ['MAIN', '1', '2', '3', 'PUMP'];
export const BREAKER_ORDER: BreakerId[] = ['MAIN', '3', '1', '2'];

export interface BreakerState {
  on: Record<BreakerId, boolean>;
  /** Index into BREAKER_ORDER of the next breaker that must be switched on. */
  progress: number;
  solved: boolean;
}

export function newBreakerState(): BreakerState {
  return { on: { MAIN: false, '1': false, '2': false, '3': false, PUMP: false }, progress: 0, solved: false };
}

export type BreakerResult = 'on' | 'off' | 'trip' | 'solved' | 'ignored';

/**
 * Flips a breaker. Switching a floor breaker on out of order trips everything back off.
 * The PUMP breaker is a red herring: it can be toggled freely but does nothing.
 */
export function flipBreaker(s: BreakerState, id: BreakerId): BreakerResult {
  if (s.solved) return 'ignored';
  if (id === 'PUMP') {
    s.on.PUMP = !s.on.PUMP;
    return s.on.PUMP ? 'on' : 'off';
  }
  if (s.on[id]) {
    // Switching something off resets the sequence from that point.
    s.on[id] = false;
    const idx = BREAKER_ORDER.indexOf(id);
    for (let i = idx; i < BREAKER_ORDER.length; i++) s.on[BREAKER_ORDER[i]!] = false;
    s.progress = Math.min(s.progress, idx);
    return 'off';
  }
  if (BREAKER_ORDER[s.progress] !== id) {
    for (const b of BREAKER_ORDER) s.on[b] = false;
    s.progress = 0;
    return 'trip';
  }
  s.on[id] = true;
  s.progress++;
  if (s.progress >= BREAKER_ORDER.length) {
    s.solved = true;
    return 'solved';
  }
  return 'on';
}

export const CABINET_CODE = '1411';
export const RECORDS_CODE = '2709';
export const RECORDS_SYMBOLS = ['☾', '✶', '△', '○'];
export const SYMBOL_DIGITS: Record<string, string> = { '☾': '2', '✶': '7', '△': '0', '○': '9', '◇': '4', '✕': '1' };

export function checkCode(input: string, answer: string): boolean {
  return input.replace(/\D/g, '') === answer;
}

export function symbolsToCode(symbols: string[]): string {
  return symbols.map((s) => SYMBOL_DIGITS[s] ?? '?').join('');
}

/** CCTV "follow the motion" puzzle: the figure moves between cameras; catch her on each in turn. */
export const CCTV_TRAIL = [5, 4, 1] as const; // camera indices (0-based): 217 → stairs → ground floor
export interface CctvPuzzle {
  step: number;
  watched: number;
  solved: boolean;
}
export function newCctvPuzzle(): CctvPuzzle {
  return { step: 0, watched: 0, solved: false };
}
/** Advances when the player watches the right camera for long enough. Returns true on step change. */
export function cctvWatch(p: CctvPuzzle, cam: number, dt: number, needed = 2.2): boolean {
  if (p.solved) return false;
  if (cam !== CCTV_TRAIL[p.step]) {
    p.watched = 0;
    return false;
  }
  p.watched += dt;
  if (p.watched >= needed) {
    p.step++;
    p.watched = 0;
    if (p.step >= CCTV_TRAIL.length) p.solved = true;
    return true;
  }
  return false;
}
export function cctvMotionCam(p: CctvPuzzle): number | null {
  return p.solved ? null : (CCTV_TRAIL[p.step] ?? null);
}
