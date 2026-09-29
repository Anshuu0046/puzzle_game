import { Board, type BoardEvent, type LevelConfig, Game, pos } from '../../src/engine';

export const P = pos;

export const LEVEL: Omit<LevelConfig, 'shape'> = { id: 0, name: 'test', colors: 6, moves: 99, targetScore: 1_000_000 };

export const EIGHT_BY_EIGHT = Array.from({ length: 8 }, () => '........');

export function gameFrom(text: string, seed = 1, overrides: Partial<Omit<LevelConfig, 'shape'>> = {}): Game {
  return Game.fromBoard(Board.parse(text), { ...LEVEL, ...overrides }, seed);
}

export function eventsOf<T extends BoardEvent['type']>(events: readonly BoardEvent[], type: T): Extract<BoardEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BoardEvent, { type: T }> => e.type === type);
}

/** Replays events onto a copy of `before`, exactly as a renderer would, and returns the result. */
export function replay(before: Board, events: readonly BoardEvent[]): Board {
  const b = before.clone();
  for (const e of events) {
    switch (e.type) {
      case 'swapped':
        b.swap(e.a, e.b);
        break;
      case 'cleared':
        for (const { pos: p, piece } of e.pieces) {
          if (b.get(p)?.id !== piece.id) throw new Error(`cleared piece ${piece.id} is not at ${p.row},${p.col}`);
          b.set(p, null);
        }
        break;
      case 'fell':
        for (const f of e.falls) {
          if (b.get(f.from)?.id !== f.piece.id) throw new Error(`falling piece ${f.piece.id} is not at its origin`);
          if (b.get(f.to) !== null) throw new Error(`fall target ${f.to.row},${f.to.col} is occupied`);
          b.set(f.to, f.piece);
          b.set(f.from, null);
        }
        break;
      case 'spawned':
        for (const s of e.spawns) {
          if (b.get(s.to) !== null) throw new Error('spawn target is occupied');
          b.set(s.to, s.piece);
        }
        break;
      case 'transformed':
        if (b.get(e.pos)?.id !== e.piece.id) throw new Error('transformed piece is not at its position');
        b.set(e.pos, e.piece);
        break;
      case 'specialCreated':
        if (b.get(e.pos) !== null) throw new Error('special created on an occupied cell');
        b.set(e.pos, e.piece);
        break;
      case 'shuffled': {
        const snapshot = b.clone();
        for (const m of e.moves) {
          if (snapshot.get(m.from)?.id !== m.piece.id) throw new Error('shuffled piece is not at its origin');
        }
        for (const m of e.moves) b.set(m.to, m.piece);
        break;
      }
      default:
        break;
    }
  }
  return b;
}

export function signature(b: Board): string {
  return b.positions.map((p) => `${b.get(p)?.id ?? '-'}:${b.get(p)?.color ?? '-'}:${b.get(p)?.special ?? '-'}`).join(' ');
}
