import { createEngine, redactFor } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { planBlocks } from '../src/heuristic.ts';

const engine = createEngine(cardDb);

// Lorwyn Eclipsed (18c): Safewright Cavalry "can't be blocked by more than one creature"; the block planner never
// proposes a gang block against it (the engine rejected the second blocker and the match crashed).
describe('block planning against "can\'t be blocked by more than one creature"', () => {
  it('plans at most one blocker for Safewright Cavalry', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        step: 'beginCombat',
        p1: { battlefield: ['safewright-cavalry'] },
        p2: { battlefield: ['bear-cub', 'bear-cub', 'bear-cub'] },
      }),
    );
    g.passBoth().attack(g.id('p1', 'safewright-cavalry')).passBoth();
    const plan = planBlocks(engine, redactFor(g.state, 'p2'), 'p2');
    expect(plan.length).toBeLessThanOrEqual(1);
  });
});
