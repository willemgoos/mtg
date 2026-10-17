import { cardDb } from '@mtg/cards';
import { createEngine, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { pickTarget, startTargeting, targetsOf } from '../src/game/interaction.ts';

// Wilds of Eldraine (23b white): Dutiful Griffin's "sacrifice two enchantments" is picked on the board, one at a time, like a target.

describe('Dutiful Griffin', () => {
  const g = new GameDriver(
    createEngine(cardDb),
    buildScenario(cardDb, {
      p1: {
        graveyard: ['dutiful-griffin'],
        battlefield: ['plains', 'plains', 'plains', 'hopeful-vigil', 'a-tale-for-the-ages'],
      },
    }),
  );
  const griffin = g.id('p1', 'dutiful-griffin', 'graveyard');
  const actions = g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'activateAbility' }> =>
        a.type === 'activateAbility' && a.source === griffin,
    );

  it('lists the sacrificed enchantments as the things to pick', () => {
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.sacrificeMany).toHaveLength(2);
      expect(targetsOf(a).map((t) => ('object' in t ? t.object.id : ''))).toEqual(a.sacrificeMany);
    }
  });

  it('is finished after the second enchantment is picked', () => {
    let state = startTargeting(griffin, 'Dutiful Griffin', actions);
    const first = actions[0]!.sacrificeMany![0]!;
    const second = actions[0]!.sacrificeMany![1]!;
    const afterFirst = pickTarget(state, `obj:${first}`);
    expect(afterFirst && 'chosen' in afterFirst).toBe(true);
    state = afterFirst as typeof state;
    const done = pickTarget(state, `obj:${second}`);
    expect(done && 'type' in done && done.type).toBe('activateAbility');
  });
});
