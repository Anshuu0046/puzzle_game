import { describe, expect, it } from 'vitest';
import { Board, findGroups, findRuns, hasMatch, isInMatch, specialFor } from '../../src/engine';
import { P } from './helpers';

const groupsOf = (text: string) => findGroups(Board.parse(text));

describe('match detection', () => {
  it('finds a horizontal run of 3', () => {
    const runs = findRuns(Board.parse('R R R O'));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ color: 0, horizontal: true, cells: [P(0, 0), P(0, 1), P(0, 2)] });
  });

  it('finds a vertical run of 3', () => {
    const runs = findRuns(Board.parse('G\nG\nG\nO'));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ color: 3, horizontal: false, cells: [P(0, 0), P(1, 0), P(2, 0)] });
  });

  it('ignores pairs', () => {
    expect(hasMatch(Board.parse('R R O O\nY Y B B'))).toBe(false);
  });

  it('does not match across holes or empty cells', () => {
    expect(hasMatch(Board.parse('R R # R'))).toBe(false);
    expect(hasMatch(Board.parse('R R . R'))).toBe(false);
    expect(hasMatch(Board.parse('R\n#\nR\nR'))).toBe(false);
  });

  it('finds runs at the board edges', () => {
    const runs = findRuns(Board.parse('O Y B B B\nO Y R G P\nO P G Y R'));
    expect(runs.map((r) => r.cells[0])).toEqual([P(0, 2), P(0, 0)]);
  });

  it('classifies a straight 3 as a plain line', () => {
    const [g] = groupsOf('R R R');
    expect(g).toMatchObject({ shape: 'line', longest: 3, special: 'none' });
  });

  it('4 in a line makes a Line Blaster', () => {
    const [g] = groupsOf('B B B B');
    expect(g).toMatchObject({ shape: 'line', longest: 4, special: 'lineBlaster' });
    expect(g!.cells).toHaveLength(4);
  });

  it('5 in a line makes a Prism Orb', () => {
    const [g] = groupsOf('Y\nY\nY\nY\nY');
    expect(g).toMatchObject({ shape: 'line', longest: 5, special: 'prismOrb' });
  });

  it('6 in a line is still one group', () => {
    const groups = groupsOf('P P P P P P');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.cells).toHaveLength(6);
  });

  it('merges an L shape into one Burst Bomb group', () => {
    const groups = groupsOf(`
      R . .
      R . .
      R R R`);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ shape: 'L', special: 'burstBomb' });
    expect(groups[0]!.cells).toHaveLength(5);
  });

  it('detects every L orientation', () => {
    for (const text of ['R R R\n. . R\n. . R', 'R R R\nR . .\nR . .', '. . R\n. . R\nR R R', 'R . .\nR . .\nR R R']) {
      const groups = groupsOf(text);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.shape).toBe('L');
    }
  });

  it('detects a T shape', () => {
    const [g] = groupsOf(`
      G G G
      . G .
      . G .`);
    expect(g).toMatchObject({ shape: 'T', special: 'burstBomb' });
    expect(g!.cells).toHaveLength(5);
  });

  it('detects a sideways T', () => {
    const [g] = groupsOf(`
      O . .
      O O O
      O . .`);
    expect(g).toMatchObject({ shape: 'T', special: 'burstBomb' });
  });

  it('detects a cross (+) shape', () => {
    const [g] = groupsOf(`
      . B .
      B B B
      . B .`);
    expect(g).toMatchObject({ shape: 'cross', special: 'burstBomb' });
  });

  it('a 5-line crossing another run is still a Prism Orb', () => {
    const [g] = groupsOf(`
      . . R . .
      . . R . .
      R R R R R`);
    expect(g).toMatchObject({ shape: 'T', longest: 5, special: 'prismOrb' });
  });

  it('keeps separate same-colored matches as separate groups', () => {
    const groups = groupsOf(`
      R R R O
      O Y B G
      R R R O`);
    expect(groups).toHaveLength(2);
  });

  it('keeps different colors apart even when adjacent', () => {
    const groups = groupsOf(`
      R R R
      O O O`);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.color).sort()).toEqual([0, 1]);
  });

  it('isInMatch checks both axes and the middle of a run', () => {
    const b = Board.parse(`
      R O Y
      R O Y
      R G Y`);
    expect(isInMatch(b, P(1, 0))).toBe(true);
    expect(isInMatch(b, P(0, 1))).toBe(false);
    expect(isInMatch(b, P(2, 2))).toBe(true);
    expect(isInMatch(Board.parse('O R O R R O'), P(0, 3))).toBe(false);
    expect(isInMatch(Board.parse('O R R R O'), P(0, 2))).toBe(true);
  });

  it('isInMatch is false for empty cells and holes', () => {
    const b = Board.parse('R . R R #');
    expect(isInMatch(b, P(0, 1))).toBe(false);
    expect(isInMatch(b, P(0, 4))).toBe(false);
  });

  it('specialFor follows the priority prism > burst > line', () => {
    expect(specialFor('line', 3)).toBe('none');
    expect(specialFor('line', 4)).toBe('lineBlaster');
    expect(specialFor('L', 3)).toBe('burstBomb');
    expect(specialFor('T', 4)).toBe('burstBomb');
    expect(specialFor('cross', 5)).toBe('prismOrb');
  });
});
