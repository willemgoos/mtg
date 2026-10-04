import { createEngine } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  castGroups,
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

  // Reality Fracture (17c): Way of the Warlord, "up to one target creature or planeswalker and ... target player".
  it('an "up to one" target after a required one is picked, or finished with Done', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: { battlefield: ['way-of-the-warlord', { card: 'fra-jace-token', loyalty: 6 }] },
        p2: { battlefield: ['bear-cub'] },
      }),
    );
    const jace = g.state.battlefield.find((id) => g.obj(id).defId === 'fra-jace-token')!;
    const acts = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === jace && a.abilityIndex === 2);
    const t = startTargeting(jace, 'Jace ability', acts);
    expect(t.skip).toBeNull();
    const afterPlayer = pickTarget(t, 'player:p2');
    // The player alone is already a complete choice, but a creature may still be picked.
    expect(afterPlayer && isTargeting(afterPlayer)).toBe(true);
    if (!afterPlayer || !isTargeting(afterPlayer)) return;
    expect(afterPlayer.skip).toMatchObject({
      type: 'activateAbility',
      targets: [{ player: 'p2' }],
    });
    expect([...targetOptions(afterPlayer).keys()].sort()).toEqual(
      [`obj:${g.id('p2', 'bear-cub')}`, `obj:${jace}`].sort(),
    );
    const both = pickTarget(afterPlayer, `obj:${g.id('p2', 'bear-cub')}`);
    expect(both).toMatchObject({ type: 'activateAbility', targets: [{ player: 'p2' }, {}] });
  });

  // Reality Fracture (17c): behold a Jace, the player picks which card.
  it('a cast that beholds a card is a group of its own for each card', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['countersculpt', 'fra-jace-token'],
          battlefield: ['island', 'island', 'island', { card: 'fra-jace-token', loyalty: 2 }],
        },
        p2: { hand: ['shock'], battlefield: ['mountain'] },
      }),
    );
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [{ player: 'p1' }],
    });
    g.pass();
    const card = g.id('p1', 'countersculpt', 'hand');
    const groups = castGroups(handActions(g.legal(), card));
    // Behold the Jace you control, behold the Jace card in hand (revealed), or pay {1}.
    expect(groups.map((x) => x.length)).toEqual([1, 1, 1]);
    expect(
      groups.map((x) => {
        const a = x[0]!;
        return a.type === 'castSpell' ? Boolean(a.beholdCard) : null;
      }),
    ).toEqual([true, true, false]);
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
