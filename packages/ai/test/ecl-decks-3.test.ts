import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

describe('heuristic bot blocks', () => {
  it('never double-blocks "can\'t be blocked by more than one creature" (Safewright Cavalry)', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        step: 'beginCombat',
        p1: { battlefield: ['safewright-cavalry'] },
        p2: {
          life: 20,
          battlefield: ['bear-cub', 'bear-cub', 'bear-cub', 'bear-cub'],
        },
      }),
    );
    g.passBoth().attack(g.id('p1', 'safewright-cavalry')).passBoth();
    for (let i = 0; i < 12 && g.actor === 'p2'; i++) {
      const a: Action = bot.chooseAction(redactFor(g.state, 'p2'), 'p2');
      g.do(a);
      if (a.type === 'confirmBlockers') break;
    }
    expect(g.state.combat!.attackers[0]!.blockers.length).toBeLessThanOrEqual(1);
  });
});
