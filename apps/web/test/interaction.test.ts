import { createEngine } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  handActions,
  isTargeting,
  pickTarget,
  shouldAutoPass,
  startTargeting,
  targetKey,
  targetOptions,
} from '../src/game/interaction.ts';

const engine = createEngine(cardDb);
const settings = { fullControl: false, passTurn: null };

describe('targeting', () => {
  it('narrows two-target spells slot by slot', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['bite-down'],
          battlefield: ['forest', 'forest', 'bear-cub', 'magnigoth-sentry'],
        },
        p2: { battlefield: ['swab-goblin', 'fire-elemental'] },
      }),
    );
    const card = g.id('p1', 'bite-down', 'hand');
    const t = startTargeting(card, 'Bite Down', handActions(g.legal(), card));
    expect([...targetOptions(t).keys()].sort()).toEqual(
      [g.id('p1', 'bear-cub'), g.id('p1', 'magnigoth-sentry')].map((id) => `obj:${id}`).sort(),
    );
    const step1 = pickTarget(t, `obj:${g.id('p1', 'magnigoth-sentry')}`);
    expect(step1 && isTargeting(step1)).toBe(true);
    if (!step1 || !isTargeting(step1)) return;
    expect(targetOptions(step1).size).toBe(2);
    const done = pickTarget(step1, `obj:${g.id('p2', 'fire-elemental')}`);
    expect(done).toMatchObject({ type: 'castSpell', card });
    expect(pickTarget(step1, 'player:p2')).toBeNull();
  });

  it('keys targets stably', () => {
    expect(targetKey({ player: 'p2' })).toBe('player:p2');
    expect(targetKey({ object: { id: 'o5', zcc: 3 } })).toBe('obj:o5');
  });
});

describe('auto-pass', () => {
  it('stops in my main phase and after blocks, passes elsewhere', () => {
    const main = buildScenario(cardDb, { p1: { hand: ['shock'], battlefield: ['mountain'] } });
    expect(shouldAutoPass(main, engine.getLegalActions(main, 'p1'), 'p1', settings)).toBe(false);

    const upkeep = buildScenario(cardDb, {
      step: 'upkeep',
      p1: { hand: ['shock'], battlefield: ['mountain'] },
    });
    expect(shouldAutoPass(upkeep, engine.getLegalActions(upkeep, 'p1'), 'p1', settings)).toBe(true);
    expect(
      shouldAutoPass(upkeep, engine.getLegalActions(upkeep, 'p1'), 'p1', {
        ...settings,
        fullControl: true,
      }),
    ).toBe(false);
  });

  it('passes on its own spell but stops to respond to the opponent', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: { hand: ['shock', 'shock'], battlefield: ['mountain', 'mountain'] },
      }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [{ player: 'p2' }],
    });
    expect(shouldAutoPass(g.state, g.legal('p1'), 'p1', settings)).toBe(true);
    g.do({ type: 'passPriority', player: 'p1' });
    // p2 can't respond, but still stops so the spell is seen before it resolves.
    expect(g.legal('p2')).toHaveLength(1);
    expect(shouldAutoPass(g.state, g.legal('p2'), 'p2', settings)).toBe(false);
  });
});
