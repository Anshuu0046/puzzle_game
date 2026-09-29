import { type LevelConfig, MAX_COLORS } from '../engine';
import level001 from './levels/level-001.json';

function validate(raw: unknown): LevelConfig {
  const l = raw as LevelConfig;
  const ok =
    Number.isInteger(l.id) &&
    typeof l.name === 'string' &&
    Array.isArray(l.shape) &&
    l.shape.length > 0 &&
    l.shape.every((row) => typeof row === 'string' && row.length === l.shape[0]!.length) &&
    Number.isInteger(l.colors) &&
    l.colors >= 3 &&
    l.colors <= MAX_COLORS &&
    Number.isInteger(l.moves) &&
    l.moves > 0 &&
    Number.isInteger(l.targetScore) &&
    l.targetScore > 0;
  if (!ok) throw new Error(`invalid level data: ${JSON.stringify(raw)}`);
  return l;
}

export const LEVELS: readonly LevelConfig[] = [validate(level001)];
