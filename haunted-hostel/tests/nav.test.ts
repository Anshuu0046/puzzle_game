import { describe, expect, it } from 'vitest';
import { buildNavGraph } from '../src/enemy/nav';

describe('nav graph', () => {
  const g = buildNavGraph();
  it('connects the ground floor to the second floor via the stairs', () => {
    const a = g.nearest(18, 0, 0);
    const b = g.nearest(30, 6.8, 0);
    const p = g.path(a, b);
    expect(p.length).toBeGreaterThan(5);
    expect(p.some((i) => g.nodes[i]!.tag === 'stair')).toBe(true);
  });
  it('reaches room 217 and the records room', () => {
    const start = g.nearest(30, 6.8, 0);
    const r217 = g.nodes.find((n) => n.room === 'room217' && n.tag === 'room')!;
    expect(g.path(start, r217.id).length).toBeGreaterThan(1);
    const rec = g.nodes.find((n) => n.room === 'records')!;
    const gf = g.nearest(5, 0, 0);
    const path = g.path(gf, rec.id);
    expect(path.length).toBeGreaterThan(1);
    expect(path.some((i) => g.nodes[i]!.room === 'warden')).toBe(true);
  });
  it('can route around blocked (safe) rooms', () => {
    const a = g.nearest(5, 6.8, 0);
    const b = g.nearest(36, 6.8, 0);
    const p = g.path(a, b, (n) => n.room === 'room214');
    expect(p.every((i) => g.nodes[i]!.room !== 'room214')).toBe(true);
  });
  it('every node is reachable from the lobby', () => {
    const lobby = g.nodes.find((n) => n.room === 'lobby')!.id;
    const seen = new Set([lobby]);
    const q = [lobby];
    while (q.length) for (const n of g.nodes[q.pop()!]!.links) if (!seen.has(n)) (seen.add(n), q.push(n));
    expect(seen.size).toBe(g.nodes.length);
  });
});
