import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13c, group B: the remaining black, green and Witherbloom cards.

const PEST = 'stx-pest-token';
const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const activate = (g: GameDriver, source: string, index = 0, extra: Record<string, unknown> = {}) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets: [],
    ...extra,
  } as never);
/** Resolves the stack; "may pay" prompts are accepted, searches take the first card, everything else is left. */
function done(g: GameDriver, accept = true): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'optionalEffect') g.do({ type: 'chooseEffect', player: d.player, accept });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else break;
  }
  return g;
}
const pick = (g: GameDriver, card: string | null) =>
  g.do({ type: 'chooseCard', player: g.actor, card });
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const setLoyalty = (g: GameDriver, id: string, loyalty: number) => {
  g.obj(id).counters = { loyalty };
};

describe('green', () => {
  it('Accomplished Alchemist taps for as much mana as the life gained this turn', () => {
    const g = game({
      p1: {
        hand: ['fortifying-draught', 'serra-angel'],
        battlefield: ['accomplished-alchemist', 'forest', 'forest', 'plains', 'plains'],
      },
    });
    done(cast(g, 'fortifying-draught', [g.ref(g.id('p1', 'accomplished-alchemist'))]));
    expect(g.life('p1')).toBe(22);
    // Alchemist (2 mana now) + two Plains + a Forest = {3}{W}{W}.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    done(cast(g, 'serra-angel'));
    expect(g.zoneOf(g.id('p1', 'serra-angel', 'battlefield'))).toBe('battlefield');
  });

  it('Alchemist taps for one mana before any life is gained', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['accomplished-alchemist', 'plains', 'plains', 'forest'],
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Charge Through gives trample and draws a card', () => {
    const g = game({ p1: { hand: ['charge-through'], battlefield: ['bear-cub', 'forest'] } });
    done(cast(g, 'charge-through', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(chars(g, g.id('p1', 'bear-cub')).keywords).toContain('trample');
    expect(hand(g)).toEqual(['forest']);
  });

  it('Dragonsguard Elite grows on magecraft and doubles its counters', () => {
    const g = game({
      p1: { hand: ['charge-through'], battlefield: ['dragonsguard-elite', ...n('forest', 7)] },
    });
    const elite = g.id('p1', 'dragonsguard-elite');
    done(cast(g, 'charge-through', [g.ref(elite)]));
    expect(g.obj(elite).plusOneCounters).toBe(1);
    g.state.objects[elite]!.plusOneCounters = 3;
    done(activate(g, elite, 1));
    expect(g.obj(elite).plusOneCounters).toBe(6);
  });

  it('Ecological Appreciation puts the lesser creatures onto the battlefield and exiles itself', () => {
    const g = game({
      p1: {
        hand: ['ecological-appreciation'],
        battlefield: n('forest', 7),
        library: [
          'accomplished-alchemist',
          'oriq-loremage',
          'scurrid-colony',
          'dragonsguard-elite',
          'forest',
        ],
      },
    });
    done(cast(g, 'ecological-appreciation', [], { x: 4 }));
    expect(all(g, 'scurrid-colony')).toHaveLength(1);
    expect(all(g, 'dragonsguard-elite')).toHaveLength(1);
    expect(all(g, 'oriq-loremage')).toHaveLength(0);
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toContain('oriq-loremage');
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain(
      'ecological-appreciation',
    );
  });

  it('Emergent Sequence makes a Fractal land creature with a counter per land that entered', () => {
    const g = game({
      p1: { hand: ['emergent-sequence', 'forest'], battlefield: ['forest', 'forest'] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    cast(g, 'emergent-sequence');
    done(g);
    expect(g.decision.kind).toBe('searchLibrary');
    pick(g, (g.decision as { options: string[] }).options[0]!);
    done(g);
    const fractal = g.state.battlefield.find(
      (id) => g.obj(id).plusOneCounters > 0 && g.obj(id).defId === 'forest',
    )!;
    expect(g.obj(fractal).tapped).toBe(true);
    expect(chars(g, fractal).types).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect(chars(g, fractal).subtypes).toContain('Fractal');
    // The land played and the land fetched: two counters.
    expect(pt(g, fractal)).toEqual([2, 2]);
  });

  it('Exponential Growth doubles power X times', () => {
    const g = game({
      p1: { hand: ['exponential-growth'], battlefield: ['bear-cub', ...n('forest', 6)] },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'exponential-growth', [g.ref(bear)], { x: 2 }));
    expect(pt(g, bear)).toEqual([8, 2]);
  });

  it('Fortifying Draught gains 2 life and pumps by the life gained this turn', () => {
    const g = game({ p1: { hand: ['fortifying-draught'], battlefield: ['bear-cub', 'forest'] } });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'fortifying-draught', [g.ref(bear)]));
    expect(g.life('p1')).toBe(22);
    expect(pt(g, bear)).toEqual([4, 4]);
  });

  it('Oriq Loremage tutors a card into the graveyard, growing on an instant or sorcery', () => {
    const g = game({
      p1: { battlefield: ['oriq-loremage'], library: ['forest', 'shock', 'forest'] },
    });
    const mage = g.id('p1', 'oriq-loremage');
    activate(g, mage);
    done(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const shock = (g.decision as { options: string[] }).options.find(
      (id) => g.obj(id).defId === 'shock',
    )!;
    pick(g, shock);
    done(g);
    expect(g.zoneOf(shock)).toBe('graveyard');
    expect(g.obj(mage).plusOneCounters).toBe(1);
  });

  it('Scurrid Colony gets +2/+2 with eight lands', () => {
    const seven = game({ p1: { battlefield: ['scurrid-colony', ...n('forest', 7)] } });
    expect(pt(seven, seven.id('p1', 'scurrid-colony'))).toEqual([2, 2]);
    const eight = game({ p1: { battlefield: ['scurrid-colony', ...n('forest', 8)] } });
    expect(pt(eight, eight.id('p1', 'scurrid-colony'))).toEqual([4, 4]);
  });

  it('Tangletrap kills a flyer or an artifact', () => {
    const g = game({
      p1: { hand: ['tangletrap', 'tangletrap'], battlefield: n('forest', 4) },
      p2: { battlefield: ['serra-angel', 'pestilent-cauldron'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const cauldron = g.id('p2', 'pestilent-cauldron');
    done(cast(g, 'tangletrap', [g.ref(angel)], { mode: 0 }));
    expect(g.zoneOf(angel)).toBe('graveyard');
    done(cast(g, 'tangletrap', [g.ref(cauldron)], { mode: 1 }));
    expect(g.zoneOf(cauldron)).toBe('graveyard');
  });

  it('Verdant Mastery fetches two lands onto the battlefield and two into hand', () => {
    const g = game({ p1: { hand: ['verdant-mastery'], battlefield: n('forest', 6) } });
    cast(g, 'verdant-mastery', []);
    done(g);
    for (let i = 0; i < 4; i++) {
      expect(g.decision.kind).toBe('searchLibrary');
      pick(g, (g.decision as { options: string[] }).options[0]!);
    }
    done(g);
    const lands = g.state.battlefield.filter((id) => g.obj(id).defId === 'forest');
    expect(lands).toHaveLength(8);
    expect(lands.filter((id) => g.obj(id).tapped).length).toBeGreaterThanOrEqual(2);
    expect(hand(g)).toEqual(['forest', 'forest']);
  });

  it('Verdant Mastery for {3}{G} gives an opponent one of the lands', () => {
    const g = game({ p1: { hand: ['verdant-mastery'], battlefield: n('forest', 4) } });
    cast(g, 'verdant-mastery', [], { kicked: true });
    done(g);
    for (let i = 0; i < 4; i++) {
      expect(g.decision.kind).toBe('searchLibrary');
      pick(g, (g.decision as { options: string[] }).options[0]!);
    }
    done(g);
    const theirs = g.state.battlefield.filter((id) => g.obj(id).controller === 'p2');
    expect(theirs).toHaveLength(1);
    expect(g.obj(theirs[0]!).tapped).toBe(true);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1')).toHaveLength(6);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('black', () => {
  it('Confront the Past returns a planeswalker with mana value X or less', () => {
    const g = game({
      p1: {
        hand: ['confront-the-past'],
        graveyard: ['ral-crackling-wit'],
        battlefield: n('swamp', 5),
      },
    });
    const ral = g.id('p1', 'ral-crackling-wit', 'graveyard');
    done(cast(g, 'confront-the-past', [g.ref(ral)], { x: 4, mode: 0 }));
    expect(g.zoneOf(ral)).toBe('battlefield');
    expect(g.obj(ral).counters?.loyalty).toBe(4);
  });

  it('Confront the Past does nothing for a planeswalker above X', () => {
    const g = game({
      p1: {
        hand: ['confront-the-past'],
        graveyard: ['ral-crackling-wit'],
        battlefield: n('swamp', 4),
      },
    });
    const ral = g.id('p1', 'ral-crackling-wit', 'graveyard');
    done(cast(g, 'confront-the-past', [g.ref(ral)], { x: 3, mode: 0 }));
    expect(g.zoneOf(ral)).toBe('graveyard');
  });

  it('Confront the Past removes twice X loyalty counters from an opponent’s planeswalker', () => {
    const g = game({
      p1: { hand: ['confront-the-past'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['ral-crackling-wit'] },
    });
    const ral = g.id('p2', 'ral-crackling-wit');
    setLoyalty(g, ral, 5);
    done(cast(g, 'confront-the-past', [g.ref(ral)], { x: 2, mode: 1 }));
    expect(g.obj(ral).counters?.loyalty).toBe(1);
  });

  it('Plumb the Forbidden copies itself for each creature sacrificed', () => {
    const g = game({
      p1: {
        hand: ['plumb-the-forbidden'],
        battlefield: ['bear-cub', 'bear-cub', 'swamp', 'swamp'],
      },
    });
    const bears = g.state.battlefield.filter((id) => g.obj(id).defId === 'bear-cub');
    cast(g, 'plumb-the-forbidden', [], { sacrificeMany: bears });
    done(g);
    expect(bears.every((id) => g.zoneOf(id) === 'graveyard')).toBe(true);
    // The spell and two copies: three cards drawn, three life lost.
    expect(hand(g)).toHaveLength(3);
    expect(g.life('p1')).toBe(17);
  });

  it('Plumb the Forbidden without a sacrifice is a plain draw', () => {
    const g = game({ p1: { hand: ['plumb-the-forbidden'], battlefield: ['swamp', 'swamp'] } });
    done(cast(g, 'plumb-the-forbidden'));
    expect(hand(g)).toHaveLength(1);
    expect(g.life('p1')).toBe(19);
  });

  it('Professor Onyx drains on magecraft', () => {
    const g = game({
      p1: { hand: ['fortifying-draught'], battlefield: ['professor-onyx', 'bear-cub', 'forest'] },
    });
    done(cast(g, 'fortifying-draught', [g.ref(g.id('p1', 'bear-cub'))]));
    // Draught gains 2; Onyx drains 2 more.
    expect(g.life('p1')).toBe(24);
    expect(g.life('p2')).toBe(18);
  });

  it('Professor Onyx +1 digs three cards deep for a loss of 1 life', () => {
    const g = game({
      p1: { battlefield: ['professor-onyx'], library: ['shock', 'forest', 'forest', 'forest'] },
    });
    const onyx = g.id('p1', 'professor-onyx');
    setLoyalty(g, onyx, 5);
    activate(g, onyx, 1);
    done(g);
    expect(g.decision.kind).toBe('pickCards');
    pick(g, (g.decision as { options: string[] }).options[0]!);
    done(g);
    expect(g.obj(onyx).counters?.loyalty).toBe(6);
    expect(g.life('p1')).toBe(19);
    expect(hand(g)).toEqual(['shock']);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
  });

  it('Professor Onyx −3 makes an opponent sacrifice their biggest creature', () => {
    const g = game({
      p1: { battlefield: ['professor-onyx'] },
      p2: { battlefield: ['bear-cub', 'serra-angel'] },
    });
    const onyx = g.id('p1', 'professor-onyx');
    setLoyalty(g, onyx, 5);
    activate(g, onyx, 2);
    done(g);
    // Only one creature has the greatest power; the opponent still confirms the sacrifice.
    if (g.decision.kind === 'sacrifice') pick(g, g.id('p2', 'serra-angel'));
    expect(g.zoneOf(g.id('p2', 'bear-cub'))).toBe('battlefield');
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'serra-angel')).toBe(false);
  });

  it('Professor Onyx −8 costs an opponent without a hand 21 life', () => {
    const g = game({ p1: { battlefield: ['professor-onyx'] }, p2: { hand: [] } });
    const onyx = g.id('p1', 'professor-onyx');
    setLoyalty(g, onyx, 8);
    activate(g, onyx, 3);
    done(g);
    for (let i = 0; i < 10 && g.decision.kind === 'punisher'; i++) pick(g, null);
    expect(g.state.players.p2.lost).toBe(true);
  });

  it('Professor Onyx −8 lets an opponent discard instead of losing life', () => {
    const g = game({
      p1: { battlefield: ['professor-onyx'] },
      p2: { hand: n('forest', 7) },
    });
    const onyx = g.id('p1', 'professor-onyx');
    setLoyalty(g, onyx, 8);
    activate(g, onyx, 3);
    done(g);
    for (let i = 0; i < 10 && g.decision.kind === 'punisher'; i++) {
      const d = g.decision as { options: string[] };
      pick(g, d.options[0]!);
    }
    expect(g.life('p2')).toBe(20);
    expect(g.state.players.p2.hand).toHaveLength(0);
  });
});

describe('Witherbloom', () => {
  it('Beledros makes a Pest at each upkeep and untaps lands for 10 life, once a turn', () => {
    const g = game({ p1: { battlefield: ['beledros-witherbloom', ...n('swamp', 3)], life: 20 } });
    const beledros = g.id('p1', 'beledros-witherbloom');
    for (const id of g.state.battlefield) if (g.obj(id).defId === 'swamp') g.obj(id).tapped = true;
    activate(g, beledros, 1);
    done(g);
    expect(g.life('p1')).toBe(10);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'swamp' && g.obj(id).tapped),
    ).toHaveLength(0);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === beledros)).toBe(
      false,
    );
    g.passUntilStep('upkeep');
    done(g);
    expect(all(g, PEST).length).toBe(1);
    expect(g.obj(all(g, PEST)[0]!).controller).toBe('p1');
  });

  it('Blex buffs Pests and gains 4 life when it dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['blex-vexing-pest', PEST, 'mountain'] },
    });
    expect(pt(g, g.id('p1', PEST))).toEqual([2, 2]);
    done(cast(g, 'shock', [g.ref(g.id('p1', 'blex-vexing-pest'))]));
    expect(g.life('p1')).toBe(24);
  });

  it('Search for Blex takes any number of the top five at 3 life each', () => {
    const g = game({
      p1: {
        hand: ['blex-vexing-pest'],
        battlefield: n('swamp', 4),
        library: ['shock', 'forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'blex-vexing-pest', [], { back: true });
    done(g);
    expect(g.decision.kind).toBe('pickCards');
    pick(g, (g.decision as { options: string[] }).options[0]!);
    pick(g, null);
    done(g);
    expect(g.life('p1')).toBe(17);
    expect(hand(g)).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(5);
  });

  it('Culling Ritual destroys permanents with mana value 2 or less and adds mana for each', () => {
    const g = game({
      p1: {
        hand: ['culling-ritual'],
        battlefield: ['bear-cub', 'swamp', 'swamp', 'forest', 'forest'],
      },
      p2: { battlefield: ['bear-cub', 'serra-angel', 'forest'] },
    });
    done(cast(g, 'culling-ritual'));
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'bear-cub')).toBe(false);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'serra-angel')).toBe(true);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest')).toHaveLength(3);
    expect(g.state.players.p1.pool).toHaveLength(2);
  });

  it('Daemogoth Woe-Eater sacrifices itself and drains value when it is the only creature', () => {
    const g = game({
      p1: { battlefield: ['daemogoth-woe-eater'] },
      p2: { hand: ['forest'] },
    });
    const eater = g.id('p1', 'daemogoth-woe-eater');
    g.passUntilStep('upkeep').passUntilStep('draw').passUntilStep('upkeep');
    done(g);
    if (g.decision.kind === 'sacrificeSeveral') pick(g, eater);
    done(g);
    expect(g.decision.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p2', card: g.state.players.p2.hand[0]! });
    expect(g.zoneOf(eater)).toBe('graveyard');
    // They had one card, drew one, and discarded one.
    expect(g.state.players.p2.hand).toHaveLength(1);
    expect(g.life('p1')).toBe(22);
  });

  it('Daemogoth Woe-Eater can sacrifice another creature instead', () => {
    const g = game({ p1: { battlefield: ['daemogoth-woe-eater', 'bear-cub'] } });
    const eater = g.id('p1', 'daemogoth-woe-eater');
    const bear = g.id('p1', 'bear-cub');
    g.passUntilStep('upkeep').passUntilStep('draw').passUntilStep('upkeep');
    done(g);
    pick(g, bear);
    done(g);
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.zoneOf(eater)).toBe('battlefield');
  });

  it('Deadly Brew makes each player sacrifice and returns another permanent card', () => {
    const g = game({
      p1: {
        hand: ['deadly-brew'],
        graveyard: ['serra-angel'],
        battlefield: ['bear-cub', 'swamp', 'forest'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const mine = g.id('p1', 'bear-cub');
    cast(g, 'deadly-brew');
    done(g);
    // p1 sacrifices first, then may return another permanent card (not the sacrificed one).
    expect(g.decision.kind).toBe('sacrifice');
    pick(g, mine);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = (g.decision as { options: string[] }).options;
    expect(options.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
    pick(g, options[0]!);
    done(g);
    if (g.decision.kind === 'sacrifice') pick(g, g.id('p2', 'bear-cub'));
    expect(hand(g)).toEqual(['serra-angel']);
    expect(
      g.state.battlefield.some(
        (id) => g.obj(id).controller === 'p2' && g.obj(id).defId === 'bear-cub',
      ),
    ).toBe(false);
  });

  it('Harness Infinity exchanges hand and graveyard, then exiles itself', () => {
    const g = game({
      p1: {
        hand: ['harness-infinity', 'shock', 'forest'],
        graveyard: ['serra-angel', 'bear-cub', 'bear-cub'],
        battlefield: [...n('swamp', 4), ...n('forest', 3)],
      },
    });
    done(cast(g, 'harness-infinity'));
    expect(hand(g).sort()).toEqual(['bear-cub', 'bear-cub', 'serra-angel']);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId).sort()).toEqual([
      'forest',
      'shock',
    ]);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['harness-infinity']);
  });

  it('Infuse with Vitality gives deathtouch, gains 2 and brings the creature back tapped', () => {
    const g = game({
      p1: {
        hand: ['infuse-with-vitality', 'shock'],
        battlefield: ['bear-cub', 'swamp', 'forest', 'mountain'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'infuse-with-vitality', [g.ref(bear)]));
    expect(g.life('p1')).toBe(22);
    expect(chars(g, bear).keywords).toContain('deathtouch');
    done(cast(g, 'shock', [g.ref(bear)]));
    const back = g.state.battlefield.find((id) => g.obj(id).defId === 'bear-cub')!;
    expect(back).toBeDefined();
    expect(g.obj(back).tapped).toBe(true);
  });

  it('Necroblossom Snarl enters untapped only if you reveal a Swamp or Forest', () => {
    const withForest = game({ p1: { hand: ['necroblossom-snarl', 'forest'] } });
    withForest.do({
      type: 'playLand',
      player: 'p1',
      card: withForest.id('p1', 'necroblossom-snarl', 'hand'),
    });
    expect(withForest.obj(withForest.id('p1', 'necroblossom-snarl')).tapped).toBe(false);
    const without = game({ p1: { hand: ['necroblossom-snarl', 'island'] } });
    without.do({
      type: 'playLand',
      player: 'p1',
      card: without.id('p1', 'necroblossom-snarl', 'hand'),
    });
    expect(without.obj(without.id('p1', 'necroblossom-snarl')).tapped).toBe(true);
  });

  it('Pestilent Cauldron makes Pests, mills for the life gained and exiles graveyard cards', () => {
    const g = game({
      p1: {
        hand: ['forest', 'fortifying-draught'],
        battlefield: ['pestilent-cauldron', 'bear-cub', 'forest', 'forest'],
        graveyard: n('forest', 4),
      },
      p2: { graveyard: n('shock', 4) },
    });
    const cauldron = g.id('p1', 'pestilent-cauldron');
    // {T}, discard: a Pest.
    activate(g, cauldron, 0, { discard: g.id('p1', 'forest', 'hand') });
    done(g);
    expect(all(g, PEST)).toHaveLength(1);
    expect(g.obj(cauldron).tapped).toBe(true);
    g.obj(cauldron).tapped = false;
    // Gain 2 life, then mill two.
    done(cast(g, 'fortifying-draught', [g.ref(g.id('p1', 'bear-cub'))]));
    const before = g.state.players.p2.library.length;
    activate(g, cauldron, 1);
    done(g);
    expect(g.state.players.p2.library.length).toBe(before - 2);
  });

  it('Pestilent Cauldron exiles four cards from one graveyard and draws', () => {
    const g = game({
      p1: { battlefield: ['pestilent-cauldron', ...n('swamp', 4)] },
      p2: { graveyard: n('shock', 4) },
    });
    const cauldron = g.id('p1', 'pestilent-cauldron');
    const targets = g.state.players.p2.graveyard.map((id) => g.ref(id));
    activate(g, cauldron, 3, { targets });
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(0);
    expect(hand(g)).toEqual(['forest']);
  });

  it('Restorative Burst returns two cards, gains each player 4 life and exiles itself', () => {
    const g = game({
      p1: {
        hand: ['pestilent-cauldron'],
        graveyard: ['serra-angel', 'forest', 'shock'],
        battlefield: n('forest', 5),
      },
    });
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const land = g.id('p1', 'forest', 'graveyard');
    cast(g, 'pestilent-cauldron', [g.ref(angel), g.ref(land)], { back: true });
    done(g);
    expect(hand(g).sort()).toEqual(['forest', 'serra-angel']);
    expect(g.life('p1')).toBe(24);
    expect(g.life('p2')).toBe(24);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['pestilent-cauldron']);
  });

  it('Rushed Rebirth fetches a lesser creature when the target dies', () => {
    const g = game({
      p1: {
        hand: ['rushed-rebirth', 'shock'],
        battlefield: ['bear-cub', 'swamp', 'forest', 'mountain'],
        library: ['valentin-dean-of-the-vein', 'forest'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'rushed-rebirth', [g.ref(bear)]));
    done(cast(g, 'shock', [g.ref(bear)]));
    expect(g.decision.kind).toBe('searchLibrary');
    const options = (g.decision as { options: string[] }).options;
    expect(options.map((id) => g.obj(id).defId)).toEqual(['valentin-dean-of-the-vein']);
    pick(g, options[0]!);
    done(g);
    const valentin = g.id('p1', 'valentin-dean-of-the-vein');
    expect(g.obj(valentin).tapped).toBe(true);
  });

  it('Valentin exiles opposing nontoken creatures instead of dying, for a Pest at {2}', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['valentin-dean-of-the-vein', 'mountain', 'forest', 'forest'],
      },
      p2: { battlefield: ['bear-cub', 'bear-cub'] },
    });
    const bear = g.state.battlefield.find((id) => g.obj(id).defId === 'bear-cub')!;
    done(cast(g, 'shock', [g.ref(bear)]));
    expect(g.zoneOf(bear)).toBe('exile');
    expect(all(g, PEST)).toHaveLength(1);
  });

  it('Valentin: declining the {2} makes no Pest', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['valentin-dean-of-the-vein', 'mountain', 'forest', 'forest'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    done(cast(g, 'shock', [g.ref(bear)]), false);
    expect(g.zoneOf(bear)).toBe('exile');
    expect(all(g, PEST)).toHaveLength(0);
  });

  it('Lisette grows the team when you gain life and pay {1}', () => {
    const g = game({
      p1: {
        hand: ['valentin-dean-of-the-vein', 'fortifying-draught'],
        battlefield: ['bear-cub', ...n('forest', 6)],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'valentin-dean-of-the-vein', [], { back: true }));
    done(cast(g, 'fortifying-draught', [g.ref(bear)]));
    const lisette = g.id('p1', 'lisette-dean-of-the-root');
    expect(g.obj(lisette).plusOneCounters).toBe(1);
    expect(g.obj(bear).plusOneCounters).toBe(1);
  });

  it('Witherbloom Command: a -3/-1 and a drain', () => {
    const g = game({
      p1: { hand: ['witherbloom-command'], battlefield: ['swamp', 'forest'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const modes = cardDb.get('witherbloom-command')!.modes!;
    const index = modes.findIndex((m) => /-3\/-1.*loses 2 life/.test(m.label ?? ''));
    expect(index).toBeGreaterThanOrEqual(0);
    done(cast(g, 'witherbloom-command', [g.ref(bear)], { mode: index }));
    expect(pt(g, bear)).toEqual([-1, 1]);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Witherbloom Command: mill three, return a land, and destroy a cheap noncreature permanent', () => {
    const g = game({
      p1: {
        hand: ['witherbloom-command'],
        graveyard: ['forest'],
        battlefield: ['swamp', 'forest'],
      },
      p2: { battlefield: ['treasure-token'] },
    });
    const treasure = g.id('p2', 'treasure-token');
    const modes = cardDb.get('witherbloom-command')!.modes!;
    const index = modes.findIndex((m) => /^Target player mills.*\+ Destroy/.test(m.label ?? ''));
    expect(index).toBeGreaterThanOrEqual(0);
    const before = g.state.players.p2.library.length;
    cast(g, 'witherbloom-command', [{ player: 'p2' }, g.ref(treasure)], { mode: index });
    done(g);
    if (g.decision.kind === 'searchLibrary')
      pick(g, (g.decision as { options: string[] }).options[0]!);
    done(g);
    expect(g.state.players.p2.library.length).toBe(before - 3);
    expect(g.zoneOf(treasure)).toBe('graveyard');
    expect(hand(g)).toEqual(['forest']);
  });
});
