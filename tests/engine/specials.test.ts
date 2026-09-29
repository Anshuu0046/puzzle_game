import { describe, expect, it } from 'vitest';
import { Board, type BoardEvent, bestMove, findGroups, specialPosition, hasMove, isValidSwap, posKey, shuffleBoard, Rng } from '../../src/engine';
import { P, eventsOf, gameFrom, replay, signature } from './helpers';

const keys = (cells: readonly { row: number; col: number }[]) => cells.map(posKey).sort();

function firstStep(events: readonly BoardEvent[]) {
  return {
    created: eventsOf(events, 'specialCreated').filter((e) => e.cascade === 1),
    activated: eventsOf(events, 'specialActivated').filter((e) => e.cascade === 1),
    cleared: eventsOf(events, 'cleared')[0]!,
    scored: eventsOf(events, 'scored')[0]!,
  };
}

describe('special creation', () => {
  it('a horizontal 4 makes a column Line Blaster where the player moved', () => {
    const game = gameFrom('R R O R\nB G R Y');
    const result = game.trySwap(P(1, 2), P(0, 2));
    const { created } = firstStep(result.events);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ pos: P(0, 2), piece: { color: 0, special: 'lineV' } });
    expect(keys(created[0]!.from)).toEqual(keys([P(0, 0), P(0, 1), P(0, 2), P(0, 3)]));
  });

  it('a vertical 4 makes a row Line Blaster', () => {
    const game = gameFrom('R B\nR G\nO R\nR Y');
    const result = game.trySwap(P(2, 1), P(2, 0));
    const { created } = firstStep(result.events);
    expect(created[0]).toMatchObject({ pos: P(2, 0), piece: { color: 0, special: 'lineH' } });
  });

  it('an L makes a Burst Bomb at the moved cell', () => {
    const game = gameFrom(`
      R O G
      R Y B
      O R R
      R G Y`);
    const result = game.trySwap(P(3, 0), P(2, 0));
    const { created } = firstStep(result.events);
    expect(eventsOf(result.events, 'matched')[0]!.groups[0]!.shape).toBe('L');
    expect(created[0]).toMatchObject({ pos: P(2, 0), piece: { color: 0, special: 'burst' } });
  });

  it('a 5-line makes a colorless Prism Orb', () => {
    const game = gameFrom('R R O R R\nG B R Y G');
    const result = game.trySwap(P(1, 2), P(0, 2));
    const { created } = firstStep(result.events);
    expect(created[0]).toMatchObject({ pos: P(0, 2), piece: { color: null, special: 'prism' } });
  });

  it('without a swapped cell, a special spawns mid-run or at the crossing', () => {
    const [line] = findGroups(Board.parse('R R R R'));
    expect(specialPosition(line!, [])).toEqual(P(0, 1));
    expect(specialPosition(line!, [P(0, 3)])).toEqual(P(0, 3));
    expect(specialPosition(line!, [P(1, 3)])).toEqual(P(0, 1));
    const [ell] = findGroups(Board.parse('R . .\nR . .\nR R R'));
    expect(specialPosition(ell!, [])).toEqual(P(2, 0));
    const [tee] = findGroups(Board.parse('G G G\n. G .\n. G .'));
    expect(specialPosition(tee!, [])).toEqual(P(0, 1));
  });

  it('events replay exactly when specials are created', () => {
    const game = gameFrom('R R O R R\nG B R Y G');
    const before = game.board;
    const result = game.trySwap(P(1, 2), P(0, 2));
    expect(signature(replay(before, result.events))).toBe(signature(game.board));
  });
});

describe('special activation', () => {
  it('a Line Blaster caught in a match sweeps its row', () => {
    const game = gameFrom(`
      Y O R B P
      R- R O G B
      B P Y G O`);
    const result = game.trySwap(P(0, 2), P(1, 2));
    const { activated, cleared, scored } = firstStep(result.events);
    expect(activated).toHaveLength(1);
    expect(activated[0]).toMatchObject({ pos: P(1, 0), effect: 'row' });
    expect(keys(activated[0]!.cells)).toEqual(keys([P(1, 0), P(1, 1), P(1, 2), P(1, 3), P(1, 4)]));
    expect(keys(cleared.pieces.map((c) => c.pos))).toEqual(keys([P(1, 0), P(1, 1), P(1, 2), P(1, 3), P(1, 4)]));
    // 3 matched × 20 + 2 blasted × 30 + row bonus 60
    expect(scored.points).toBe(180);
  });

  it('specials chain: a Burst Bomb hits a column Line Blaster, which fires too', () => {
    const game = gameFrom(`
      Y B| R G
      R* R O B
      G P Y O
      P Y G B`);
    const result = game.trySwap(P(0, 2), P(1, 2));
    const { activated, cleared } = firstStep(result.events);
    expect(activated.map((a) => [a.effect, posKey(a.pos)])).toEqual([
      ['burst', '1,0'],
      ['column', '0,1'],
    ]);
    expect(keys(activated[0]!.cells)).toEqual(keys([P(0, 0), P(0, 1), P(1, 0), P(1, 1), P(2, 0), P(2, 1)]));
    const clearedKeys = keys(cleared.pieces.map((c) => c.pos));
    expect(clearedKeys).toContain('3,1');
    expect(clearedKeys).toContain('1,2');
  });

  it('a Prism Orb hit by a blast clears the most common remaining color', () => {
    const game = gameFrom(`
      Y G R B G
      R- R O @ G
      B P Y G O
      G B G O G`);
    const result = game.trySwap(P(0, 2), P(1, 2));
    const prism = eventsOf(result.events, 'specialActivated').find((e) => e.effect === 'colorClear')!;
    expect(prism.pos).toEqual(P(1, 3));
    // Outside the blasted row G (6) is the most common color; the orb reaches every G, (1,4) included.
    expect(keys(prism.cells)).toEqual(keys([P(1, 3), P(1, 4), P(0, 1), P(0, 4), P(2, 3), P(3, 0), P(3, 2), P(3, 4)]));
  });

  it('a special does not fire twice', () => {
    const game = gameFrom(`
      Y O R B P
      R- R O G B
      B P Y G O`);
    const result = game.trySwap(P(0, 2), P(1, 2));
    const firstCascade = eventsOf(result.events, 'specialActivated').filter((e) => e.cascade === 1);
    expect(firstCascade.filter((e) => posKey(e.pos) === '1,0')).toHaveLength(1);
  });
});

describe('combo swaps', () => {
  it('Prism + plain piece clears every piece of that color', () => {
    const game = gameFrom(`
      @ R O Y
      G R B R
      O Y G P`);
    const result = game.trySwap(P(0, 0), P(0, 1));
    expect(result.accepted).toBe(true);
    const { activated, cleared, scored } = firstStep(result.events);
    expect(activated[0]!.effect).toBe('colorClear');
    // The prism moved to (0,1); the R it swapped with is now at (0,0).
    expect(keys(cleared.pieces.map((c) => c.pos))).toEqual(keys([P(0, 1), P(0, 0), P(1, 1), P(1, 3)]));
    expect(scored.points).toBe(4 * 30 + 150);
  });

  it('works whichever piece the player drags', () => {
    const game = gameFrom(`
      @ R O Y
      G R B R
      O Y G P`);
    const result = game.trySwap(P(0, 1), P(0, 0));
    const { cleared } = firstStep(result.events);
    expect(cleared.pieces).toHaveLength(4);
  });

  it('Prism + Line Blaster turns the color into blasters that all fire', () => {
    const game = gameFrom(`
      @ R- O Y
      G R B R
      O Y G P`);
    const result = game.trySwap(P(0, 0), P(0, 1));
    const { activated } = firstStep(result.events);
    expect(activated[0]!.effect).toBe('prismLines');
    const transformed = eventsOf(result.events, 'transformed');
    expect(keys(transformed.map((t) => t.pos))).toEqual(keys([P(1, 1), P(1, 3)]));
    expect(transformed.every((t) => t.piece.special === 'lineH' || t.piece.special === 'lineV')).toBe(true);
    // The swapped blaster plus the two converted ones all go off.
    expect(activated.filter((a) => a.effect === 'row' || a.effect === 'column')).toHaveLength(3);
  });

  it('Prism + Burst Bomb turns the color into bombs', () => {
    const game = gameFrom(`
      @ R* O Y
      G R B R
      O Y G P`);
    const result = game.trySwap(P(0, 0), P(0, 1));
    const { activated } = firstStep(result.events);
    expect(activated[0]!.effect).toBe('prismBursts');
    expect(eventsOf(result.events, 'transformed').every((t) => t.piece.special === 'burst')).toBe(true);
    expect(activated.filter((a) => a.effect === 'burst')).toHaveLength(3);
  });

  it('Prism + Prism wipes the board', () => {
    const game = gameFrom(`
      @ @ O Y
      G R B R
      O # G P`);
    const result = game.trySwap(P(0, 0), P(0, 1));
    const { activated, cleared } = firstStep(result.events);
    expect(activated[0]!.effect).toBe('boardWipe');
    expect(cleared.pieces).toHaveLength(11);
  });

  it('Line + Line fires a cross through the target cell', () => {
    const game = gameFrom(`
      Y O G B
      R- B| P G
      B P Y O
      O G B Y`);
    const result = game.trySwap(P(1, 0), P(1, 1));
    const { activated } = firstStep(result.events);
    expect(activated).toHaveLength(1);
    expect(activated[0]).toMatchObject({ effect: 'cross', pos: P(1, 1) });
    expect(keys(activated[0]!.cells)).toEqual(keys([P(1, 0), P(1, 1), P(1, 2), P(1, 3), P(0, 1), P(2, 1), P(3, 1)]));
  });

  it('Line + Burst fires three rows and three columns', () => {
    const game = gameFrom(`
      Y O G B P
      R B P G O
      B R- Y* O Y
      O G B Y G
      P Y O B R`);
    const result = game.trySwap(P(2, 1), P(2, 2));
    const { activated } = firstStep(result.events);
    expect(activated[0]!.effect).toBe('tripleCross');
    // Rows 1-3 and columns 1-3 of a 5x5 board: 25 - 4 corners of 2x2 blocks = 21 cells.
    expect(activated[0]!.cells).toHaveLength(21);
  });

  it('Burst + Burst makes a 5x5 blast, clipped to the board', () => {
    const game = gameFrom(`
      Y O G B P
      R B* Y* G O
      B R P O Y
      O G B Y G`);
    const result = game.trySwap(P(1, 1), P(1, 2));
    const { activated } = firstStep(result.events);
    expect(activated[0]!.effect).toBe('megaBurst');
    // Centered on (1,2): rows 0-3 (clipped from -1..3), cols 0-4 → 20 cells.
    expect(activated[0]!.cells).toHaveLength(20);
  });

  it('a special swapped with a plain piece and no match bounces back', () => {
    const game = gameFrom(`
      Y O G B
      R- B P G`);
    const result = game.trySwap(P(1, 0), P(1, 1));
    expect(result.accepted).toBe(false);
    expect(result.events[0]!.type).toBe('swapRejected');
  });

  it('combo events replay exactly', () => {
    const cases = [
      { text: '@ R- O Y\nG R B R\nO Y G P', a: P(0, 0), b: P(0, 1) },
      { text: '@ R* O Y\nG R B R\nO Y G P', a: P(0, 0), b: P(0, 1) },
      { text: '@ @ O Y\nG R B R\nO # G P', a: P(0, 0), b: P(0, 1) },
      { text: 'Y O G B\nR- B| P G\nB P Y O\nO G B Y', a: P(1, 0), b: P(1, 1) },
    ];
    for (const { text, a, b } of cases) {
      const game = gameFrom(text, 3);
      const before = game.board;
      const result = game.trySwap(a, b);
      expect(result.accepted).toBe(true);
      expect(signature(replay(before, result.events))).toBe(signature(game.board));
    }
  });
});

describe('moves with specials', () => {
  it('any Prism Orb swap and any special pair is a legal move', () => {
    const b = Board.parse('@ R\nO Y');
    expect(isValidSwap(b, P(0, 0), P(0, 1))).toBe(true);
    expect(isValidSwap(b, P(0, 0), P(1, 0))).toBe(true);
    expect(isValidSwap(Board.parse('R- G*'), P(0, 0), P(0, 1))).toBe(true);
    expect(isValidSwap(Board.parse('R- G'), P(0, 0), P(0, 1))).toBe(false);
  });

  it('a board with only a Prism Orb move still has moves', () => {
    const b = Board.parse(`
      R O Y R
      O Y R O
      Y R @ Y
      R O Y R`);
    expect(hasMove(b)).toBe(true);
  });

  it('hints prefer combos', () => {
    const b = Board.parse(`
      R R O R
      G B- G* Y
      Y O Y B`);
    expect(bestMove(b)).toEqual({ a: P(1, 1), b: P(1, 2) });
  });

  it('shuffle keeps specials when it has to recolor', () => {
    const board = Board.parse('R- O Y G');
    shuffleBoard(board, [0, 1, 2], new Rng(1));
    expect(board.pieces().filter(({ piece }) => piece.special === 'lineH')).toHaveLength(1);
    expect(board.pieces().find(({ piece }) => piece.special === 'lineH')!.piece.id).toBe(1);
  });
});
