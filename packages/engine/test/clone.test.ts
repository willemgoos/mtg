import { describe, expect, it } from 'vitest';
import { cloneState } from '../src/clone.ts';
import { buildScenario } from '../src/testing.ts';
import { DB } from './helpers.ts';

// Bots simulate on clones: a clone must never share mutable state with the original.
describe('cloneState', () => {
  it('copies every per-turn record instead of sharing it', () => {
    const s = buildScenario(DB, {});
    s.turn.manaSpent = { p1: 1, p2: 0 };
    s.turn.lifeLost = { p1: 1, p2: 0 };
    s.turn.spellsCast = { p1: 1, p2: 0 };
    s.turn.creaturesExiled = { p1: 1, p2: 0 };
    const c = cloneState(s);
    for (const [key, value] of Object.entries(s.turn))
      if (value && typeof value === 'object')
        expect(c.turn[key as keyof typeof c.turn], `turn.${key}`).not.toBe(value);
  });
});
