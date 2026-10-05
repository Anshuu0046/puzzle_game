import { describe, expect, it } from 'vitest';
import {
  CABINET_CODE,
  RECORDS_CODE,
  RECORDS_SYMBOLS,
  cctvMotionCam,
  cctvWatch,
  checkCode,
  flipBreaker,
  newBreakerState,
  newCctvPuzzle,
  symbolsToCode,
} from '../src/systems/puzzles';

describe('breaker panel', () => {
  it('solves with MAIN, 3, 1, 2', () => {
    const s = newBreakerState();
    expect(flipBreaker(s, 'MAIN')).toBe('on');
    expect(flipBreaker(s, '3')).toBe('on');
    expect(flipBreaker(s, '1')).toBe('on');
    expect(flipBreaker(s, '2')).toBe('solved');
    expect(s.solved).toBe(true);
  });
  it('trips everything when switched out of order', () => {
    const s = newBreakerState();
    flipBreaker(s, 'MAIN');
    expect(flipBreaker(s, '2')).toBe('trip');
    expect(Object.values(s.on).filter(Boolean).length).toBe(0);
    expect(s.progress).toBe(0);
  });
  it('treats the pump breaker as a free toggle', () => {
    const s = newBreakerState();
    expect(flipBreaker(s, 'PUMP')).toBe('on');
    expect(flipBreaker(s, 'MAIN')).toBe('on');
    expect(s.progress).toBe(1);
  });
  it('switching a breaker off rolls progress back', () => {
    const s = newBreakerState();
    flipBreaker(s, 'MAIN');
    flipBreaker(s, '3');
    expect(flipBreaker(s, 'MAIN')).toBe('off');
    expect(s.progress).toBe(0);
    expect(s.on['3']).toBe(false);
  });
});

describe('codes', () => {
  it('cabinet code is the date she disappeared', () => {
    expect(checkCode('14-11', CABINET_CODE)).toBe(true);
    expect(checkCode('1114', CABINET_CODE)).toBe(false);
  });
  it('diary symbols decode to the records room code', () => {
    expect(symbolsToCode(RECORDS_SYMBOLS)).toBe(RECORDS_CODE);
  });
});

describe('cctv trail', () => {
  it('requires watching each camera in turn', () => {
    const p = newCctvPuzzle();
    expect(cctvMotionCam(p)).toBe(5);
    expect(cctvWatch(p, 3, 5)).toBe(false);
    expect(cctvWatch(p, 5, 1)).toBe(false);
    expect(cctvWatch(p, 5, 1.5)).toBe(true);
    expect(cctvMotionCam(p)).toBe(4);
    cctvWatch(p, 4, 3);
    cctvWatch(p, 1, 3);
    expect(p.solved).toBe(true);
    expect(cctvMotionCam(p)).toBe(null);
  });
});
