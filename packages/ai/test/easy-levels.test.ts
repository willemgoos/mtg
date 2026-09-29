import { describe, expect, it } from 'vitest';
import { EASY_LEVELS } from '../src/index.ts';

describe('easy bot levels', () => {
  it('make fewer mistakes at every step', () => {
    const keys = ['holdChance', 'skipAttackChance', 'skipBlockChance', 'skipLandChance'] as const;
    for (let i = 1; i < EASY_LEVELS.length; i++)
      for (const k of keys)
        expect(EASY_LEVELS[i]![k] ?? 0, `level ${i + 1} ${k}`).toBeLessThanOrEqual(
          EASY_LEVELS[i - 1]![k] ?? 0,
        );
    // Only the top levels answer at instant speed.
    expect(EASY_LEVELS.map((l) => !!l.respond)).toEqual([false, false, false, false, true, true]);
  });
});
