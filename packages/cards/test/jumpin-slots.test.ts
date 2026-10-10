import { getAbilities, getCharacteristics, getColors } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Cards only Arena's Jump In packets' random slots play (Bloomburrow and Foundations packets).

const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const pick = (g: GameDriver, card: string | null) =>
  g.do({ type: 'chooseCard', player: g.actor, card });
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id: string) => g.obj(id).defId);
const grave = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id: string) => g.obj(id).defId);

describe('Jump In slot cards', () => {
  it('Polygraph Orb: two of the top four to hand, the rest to the graveyard, lose 2', () => {
    const g = game({
      p1: {
        hand: ['polygraph-orb'],
        battlefield: n('swamp', 5),
        library: ['shock', 'bear-cub', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'polygraph-orb');
    settle(g);
    expect(g.decision.kind).toBe('pickCards');
    const options = (g.decision as { options: string[] }).options;
    const byId = (d: string) => options.find((id) => g.obj(id).defId === d)!;
    pick(g, byId('shock'));
    if (g.decision.kind === 'pickCards') pick(g, byId('bear-cub'));
    if (g.decision.kind === 'pickCards') pick(g, null);
    settle(g);
    expect(hand(g).sort()).toEqual(['bear-cub', 'shock']);
    expect(grave(g)).toEqual(['forest', 'forest']);
    expect(g.life('p1')).toBe(18);
  });

  it('Polygraph Orb: collect evidence 3 is chosen card by card; the opponent discards, sacrifices a creature or loses 3', () => {
    const g = game({
      p1: {
        battlefield: ['polygraph-orb', ...n('swamp', 2)],
        graveyard: ['savannah-lions', 'bear-cub', 'gnarlback-rhino', 'forest'],
      },
      p2: { battlefield: ['bear-cub', 'forest'] },
    });
    const orb = g.id('p1', 'polygraph-orb');
    g.do({ type: 'activateAbility', player: 'p1', source: orb, abilityIndex: 1, targets: [] });
    expect(g.decision.kind).toBe('forageExile');
    // Lands have no mana value: they aren't offered.
    const offered = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(offered.sort()).toEqual(['bear-cub', 'gnarlback-rhino', 'savannah-lions']);
    pick(g, g.id('p1', 'savannah-lions', 'graveyard'));
    expect(g.decision.kind).toBe('forageExile');
    pick(g, g.id('p1', 'bear-cub', 'graveyard'));
    // 1 + 2 = 3: done.
    expect(g.decision.kind).not.toBe('forageExile');
    expect(grave(g).sort()).toEqual(['forest', 'gnarlback-rhino']);
    g.passBoth();
    expect(g.decision.kind).toBe('punisher');
    // Only creatures may be sacrificed (not the Forest).
    const choices = g
      .legal('p2')
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(choices).toEqual(['bear-cub']);
    pick(g, null);
    expect(g.life('p2')).toBe(17);
  });

  it("Polygraph Orb can't be activated without mana value 3 in the graveyard", () => {
    const g = game({
      p1: {
        battlefield: ['polygraph-orb', ...n('swamp', 2)],
        graveyard: ['savannah-lions', 'forest', 'forest'],
      },
    });
    const orb = g.id('p1', 'polygraph-orb');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === orb)).toBe(false);
  });

  it('Nezumi Informant makes each opponent discard', () => {
    const g = game({
      p1: { hand: ['nezumi-informant'], battlefield: n('swamp', 2) },
      p2: { hand: ['shock'] },
    });
    settle(cast(g, 'nezumi-informant'));
    // The opponent picks the card to discard when it has a choice; with one card it goes.
    if (g.decision.kind !== 'priority') g.do(g.legal('p2')[0]!);
    settle(g);
    expect(grave(g, 'p2')).toEqual(['shock']);
  });

  it("Ephara's Dispersal costs {2} less on an attacker, bounces it and surveils 2", () => {
    const g = game({
      p1: { battlefield: ['bear-cub'] },
      p2: { hand: ['epharas-dispersal'], battlefield: ['island'], library: n('forest', 5) },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    g.pass();
    expect(g.actor).toBe('p2');
    cast(g, 'epharas-dispersal', [g.ref(bear)]);
    settle(g);
    expect(g.zoneOf(bear)).toBe('hand');
    expect(g.decision.kind).toBe('scry');
  });

  it("Valkyrie's Call returns a dying nontoken creature as a flying Angel with a counter", () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['valkyries-call', 'savannah-lions', 'mountain'] },
    });
    settle(cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]));
    settle(g);
    const lions = all(g, 'savannah-lions')[0]!;
    expect(lions).toBeDefined();
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(chars(g, lions).keywords).toContain('flying');
    expect(chars(g, lions).subtypes).toContain('Angel');
  });

  it("Valkyrie's Call: a creature it made an Angel stays dead the second time", () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['valkyries-call', 'savannah-lions', ...n('mountain', 2)],
      },
    });
    settle(cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]));
    const lions = all(g, 'savannah-lions')[0]!;
    settle(cast(g, 'shock', [g.ref(lions)]));
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(grave(g)).toContain('savannah-lions');
  });

  it("Valkyrie's Call doesn't bring back Angels", () => {
    const g = game({
      p1: { battlefield: ['valkyries-call', 'serra-angel'] },
      p2: { hand: ['shock', 'shock'], battlefield: n('mountain', 2) },
      active: 'p2',
    });
    const angel = g.id('p1', 'serra-angel');
    settle(cast(g, 'shock', [g.ref(angel)]));
    settle(cast(g, 'shock', [g.ref(angel)]));
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(grave(g)).toContain('serra-angel');
  });

  it('Flamewake Phoenix comes back at your combat for {R} with ferocious, and must attack', () => {
    const g = game({
      p1: { battlefield: ['gnarlback-rhino', 'mountain'], graveyard: ['flamewake-phoenix'] },
    });
    g.passUntilStep('beginCombat');
    settle(g);
    if (g.decision.kind === 'optionalEffect')
      g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    const phoenix = all(g, 'flamewake-phoenix')[0];
    expect(phoenix).toBeDefined();
    expect([...chars(g, phoenix!).keywords]).toEqual(expect.arrayContaining(['flying', 'haste']));
  });

  it('Flamewake Phoenix stays in the graveyard without a power 4 creature', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', 'mountain'], graveyard: ['flamewake-phoenix'] },
    });
    g.passUntilStep('beginCombat');
    settle(g);
    expect(g.decision.kind).not.toBe('optionalEffect');
    expect(grave(g)).toContain('flamewake-phoenix');
  });

  it('Raise the Past returns your creature cards with mana value 2 or less', () => {
    const g = game({
      p1: {
        hand: ['raise-the-past'],
        battlefield: n('plains', 4),
        graveyard: ['savannah-lions', 'bear-cub', 'gnarlback-rhino', 'shock'],
      },
      p2: { graveyard: ['llanowar-elves'] },
    });
    settle(cast(g, 'raise-the-past'));
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(grave(g)).toEqual(expect.arrayContaining(['gnarlback-rhino', 'shock']));
    expect(grave(g, 'p2')).toEqual(['llanowar-elves']);
  });

  it('Immersturm Predator: tapping exiles a graveyard card and grows it; a sacrifice makes it indestructible and taps it', () => {
    const g = game({
      p1: { battlefield: ['immersturm-predator', 'bear-cub'] },
      p2: { graveyard: ['shock'] },
    });
    const predator = g.id('p1', 'immersturm-predator');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: predator,
      abilityIndex: 1,
      targets: [],
      sacrifice: g.id('p1', 'bear-cub'),
    });
    settle(g);
    expect(chars(g, predator).keywords).toContain('indestructible');
    expect(g.obj(predator).tapped).toBe(true);
    // The trigger exiled a graveyard card (the first legal one: the sacrificed Bear Cub).
    expect(grave(g)).toEqual([]);
    expect(pt(g, predator)).toEqual([4, 4]);
  });

  it('Dread Summons: each player mills X, a tapped Zombie for each creature card milled', () => {
    const g = game({
      p1: {
        hand: ['dread-summons'],
        battlefield: n('swamp', 5),
        library: ['bear-cub', 'forest', 'savannah-lions', 'forest'],
      },
      p2: { library: ['gnarlback-rhino', 'forest', 'forest', 'forest'] },
    });
    settle(cast(g, 'dread-summons', [], { x: 3 }));
    const zombies = all(g, 'zombie-token');
    expect(zombies).toHaveLength(3);
    for (const z of zombies) expect(g.obj(z).tapped).toBe(true);
    expect(g.state.players.p1.graveyard).toHaveLength(4);
    expect(g.state.players.p2.graveyard).toHaveLength(3);
  });

  it('Imprisoned in the Moon makes a creature a colorless land that taps for {C}', () => {
    const g = game({
      p1: { hand: ['imprisoned-in-the-moon'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'imprisoned-in-the-moon', [g.ref(angel)]));
    expect(getColors(g.state, cardDb, angel)).toEqual([]);
    expect(getAbilities(g.state, cardDb, angel)).toEqual([
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
    ]);
    expect([...chars(g, angel).keywords]).not.toContain('flying');
    expect(chars(g, angel).subtypes).toEqual([]);
    expect(g.zoneOf(angel)).toBe('battlefield');
    // It's a land now: it can't attack.
    g.passUntilStep('main2').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    g.passUntilStep('declareAttackers');
    expect(g.legal('p2').some((a) => a.type === 'addAttacker' && a.attacker === angel)).toBe(false);
  });
});
