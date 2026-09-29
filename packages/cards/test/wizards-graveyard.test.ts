import { type Action, createEngine, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

// Cards and mechanics added for Wondrous Wizardry and Graveyard Gifts.

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const n = (card: string, count: number) => Array<string>(count).fill(card);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
const kw = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) => {
  const player = g.actor;
  return g.do({ type: 'castSpell', player, card: g.id(player, defId, 'hand'), targets, ...extra });
};
const tokens = (g: GameDriver, defId: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId);
const castable = (g: GameDriver, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);

describe('counterspells', () => {
  it('Essence Scatter counters a creature spell', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['essence-scatter'], battlefield: n('island', 2) },
    });
    const bear = g.id('p1', 'bear-cub', 'hand');
    cast(g, 'bear-cub').pass(); // p1 passes; p2 responds
    cast(g, 'essence-scatter', [g.ref(bear)]).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.state.stack).toHaveLength(0);
  });

  it("Curator of Destinies can be targeted but can't be countered", () => {
    const g = game({
      p1: { hand: ['curator-of-destinies'], battlefield: n('island', 6), library: n('forest', 6) },
      p2: { hand: ['essence-scatter'], battlefield: n('island', 2) },
    });
    const curator = g.id('p1', 'curator-of-destinies', 'hand');
    cast(g, 'curator-of-destinies').pass();
    cast(g, 'essence-scatter', [g.ref(curator)]).passBoth();
    expect(g.state.stack).toHaveLength(1); // Curator is still there
    g.passBoth();
    expect(g.zoneOf(curator)).toBe('battlefield');
  });
});

describe('spell triggers and costs', () => {
  it('Archmage of Runes: instants cost {1} less and draw a card', () => {
    const g = game({
      p1: { hand: ['quick-study'], battlefield: [...n('island', 2), 'archmage-of-runes'] },
    });
    expect(castable(g, 'quick-study')).toBe(true); // {2}{U} for two Islands
    cast(g, 'quick-study').passBoth().passBoth();
    expect(g.state.players.p1.hand).toHaveLength(3);
  });

  it('Balmor pumps your team when you cast an instant or sorcery', () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: ['island', 'balmor-battlemage-captain', 'bear-cub'] },
    });
    cast(g, 'opt').passBoth();
    const bear = g.id('p1', 'bear-cub');
    expect(pt(g, bear)).toEqual([3, 2]);
    expect(kw(g, bear).has('trample')).toBe(true);
  });

  it('Ovika makes Goblins equal to the spell’s mana value, with haste', () => {
    const g = game({
      p1: { hand: ['quick-study'], battlefield: [...n('island', 3), 'ovika-enigma-goliath'] },
    });
    cast(g, 'quick-study').passBoth();
    const goblins = tokens(g, 'phyrexian-goblin-token');
    expect(goblins).toHaveLength(3);
    expect(kw(g, goblins[0]!).has('haste')).toBe(true);
  });

  it("Ovika's ward costs {3} and 3 life", () => {
    const g = game({
      p1: { hand: ['stab'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['ovika-enigma-goliath'] },
    });
    expect(castable(g, 'stab')).toBe(false);
    const rich = game({
      p1: { life: 10, hand: ['stab'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['ovika-enigma-goliath'] },
    });
    cast(rich, 'stab', [rich.ref(rich.id('p2', 'ovika-enigma-goliath'))]);
    expect(rich.life('p1')).toBe(7);
  });

  it('Tolarian Terror costs {1} less per instant and sorcery in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['tolarian-terror'],
        battlefield: n('island', 2),
        graveyard: ['opt', 'stab', 'quick-study', 'shock', 'dive-down'],
      },
    });
    expect(castable(g, 'tolarian-terror')).toBe(true);
  });

  it('Arcane Epiphany costs {1} less with a Wizard', () => {
    const g = game({
      p1: { hand: ['arcane-epiphany'], battlefield: [...n('island', 4), 'ghitu-lavarunner'] },
    });
    expect(castable(g, 'arcane-epiphany')).toBe(true);
    const none = game({ p1: { hand: ['arcane-epiphany'], battlefield: n('island', 4) } });
    expect(castable(none, 'arcane-epiphany')).toBe(false);
  });

  it('Brineborn Cutthroat grows when you cast on the opponent’s turn', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['opt'], battlefield: ['island', 'brineborn-cutthroat'] },
    });
    g.pass();
    cast(g, 'opt').passBoth().passBoth();
    expect(g.obj(g.id('p1', 'brineborn-cutthroat')).plusOneCounters).toBe(1);
  });

  it('Drake Hatcher: incubation counters from combat damage, three make a Drake', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['drake-hatcher'] } });
    const h = g.id('p1', 'drake-hatcher');
    g.state.objects[h]!.plusOneCounters = 2; // 3 power
    g.passBoth().attack(h).passUntilStep('main2');
    expect(g.obj(h).counters?.incubation).toBe(3);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: h,
      abilityIndex: 2,
      targets: [],
    }).passBoth();
    expect(tokens(g, 'drake-token')).toHaveLength(1);
    expect(g.obj(h).counters?.incubation).toBe(0);
  });
});

describe('graveyard', () => {
  it('Enigma Drake and Ghitu Lavarunner count instants and sorceries in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['enigma-drake', 'ghitu-lavarunner'],
        graveyard: ['opt', 'stab', 'bear-cub'],
      },
    });
    expect(pt(g, g.id('p1', 'enigma-drake'))).toEqual([2, 4]);
    const ghitu = g.id('p1', 'ghitu-lavarunner');
    expect(pt(g, ghitu)).toEqual([2, 2]);
    expect(kw(g, ghitu).has('haste')).toBe(true);
  });

  it('threshold: Billowing Shriekmass mills three and grows with seven cards in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['billowing-shriekmass'],
        battlefield: n('swamp', 4),
        graveyard: n('forest', 4),
        library: n('forest', 5),
      },
    });
    cast(g, 'billowing-shriekmass').passBoth().passBoth();
    expect(g.state.players.p1.graveyard).toHaveLength(7);
    expect(pt(g, g.id('p1', 'billowing-shriekmass'))).toEqual([4, 4]);
  });

  it('Zombify returns a creature card; Rise of the Dark Realms takes every graveyard', () => {
    const g = game({
      p1: { hand: ['zombify'], battlefield: n('swamp', 4), graveyard: ['gnarlback-rhino'] },
    });
    cast(g, 'zombify', [g.ref(g.id('p1', 'gnarlback-rhino', 'graveyard'))]).passBoth();
    expect(g.zoneOf(g.id('p1', 'gnarlback-rhino'))).toBe('battlefield');

    const r = game({
      p1: {
        hand: ['rise-of-the-dark-realms'],
        battlefield: n('swamp', 9),
        graveyard: ['bear-cub'],
      },
      p2: { graveyard: ['gnarlback-rhino', 'shock'] },
    });
    cast(r, 'rise-of-the-dark-realms').passBoth();
    // Found under p1's control; still owned by p2.
    const rhino = r.id('p1', 'gnarlback-rhino');
    expect(r.obj(rhino).owner).toBe('p2');
    expect(r.zoneOf(r.id('p2', 'shock', 'graveyard'))).toBe('graveyard');
  });

  it('Inspiration from Beyond mills three and returns an instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['inspiration-from-beyond'],
        battlefield: n('island', 3),
        library: ['opt', 'forest', 'bear-cub', 'forest'],
      },
    });
    cast(g, 'inspiration-from-beyond').passBoth();
    const d = g.decision;
    if (d.kind !== 'searchLibrary' || !d.fromGraveyard)
      throw new Error('expected a graveyard choice');
    // Opt from the mill, and Inspiration itself isn't in the graveyard yet.
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['opt']);
    g.do({ type: 'chooseCard', player: 'p1', card: d.options[0]! });
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['opt']);
  });

  it('Abyssal Harvester copies a creature that died this turn as a Nightmare token', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['mountain', { card: 'abyssal-harvester', sick: false }],
      },
      p2: { battlefield: ['bear-cub'], graveyard: ['gnarlback-rhino'] },
    });
    cast(g, 'shock', [g.ref(g.id('p2', 'bear-cub'))]).passBoth();
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility')
      .map((a) =>
        a.type === 'activateAbility' && 'object' in a.targets[0]!
          ? g.obj(a.targets[0].object.id).defId
          : '',
      );
    expect(targets).toEqual(['bear-cub']); // not the Rhino, which died earlier
    const bear = g.id('p2', 'bear-cub', 'graveyard');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'abyssal-harvester'),
      abilityIndex: 0,
      targets: [g.ref(bear)],
    }).passBoth();
    const copy = tokens(g, 'bear-cub');
    expect(copy).toHaveLength(1);
    expect(g.obj(copy[0]!).controller).toBe('p1');
    expect(getCharacteristics(g.state, cardDb, copy[0]!).subtypes).toContain('Nightmare');
    expect(g.zoneOf(bear)).toBe('exile');
  });

  it('Arbiter of Woe: sacrifice to cast; they discard and lose 2, you draw and gain 2', () => {
    const g = game({
      p1: {
        hand: ['arbiter-of-woe'],
        battlefield: [...n('swamp', 6), 'bear-cub'],
        library: n('forest', 2),
      },
      p2: { hand: ['shock', 'forest'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts.every((a) => a.type === 'castSpell' && a.sacrifice === bear)).toBe(true);
    g.do(casts[0]!).passBoth().passBoth();
    expect(g.decision).toMatchObject({ kind: 'discard', player: 'p2' });
    g.do({ type: 'discard', player: 'p2', card: g.id('p2', 'forest', 'hand') });
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('Kiora draws two then discards two', () => {
    const g = game({
      p1: {
        hand: ['kiora-the-rising-tide', 'forest'],
        battlefield: n('island', 3),
        library: ['opt', 'stab'],
      },
    });
    cast(g, 'kiora-the-rising-tide').passBoth().passBoth();
    expect(g.decision).toMatchObject({ kind: 'discard', count: 2 });
  });
});

describe('damage and misc', () => {
  it('Niv-Mizzet draws for noncombat damage to an opponent', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['mountain', 'niv-mizzet-visionary'],
        library: n('forest', 3),
      },
    });
    cast(g, 'shock', [{ player: 'p2' }])
      .passBoth()
      .passBoth();
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('Fiery Annihilation exiles the creature and an Equipment', () => {
    const g = game({
      p1: { hand: ['fiery-annihilation'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['gnarlback-rhino', 'goldvein-pick'] },
    });
    const rhino = g.id('p2', 'gnarlback-rhino');
    const pick = g.id('p2', 'goldvein-pick');
    cast(g, 'fiery-annihilation', [g.ref(rhino), g.ref(pick)]).passBoth();
    expect(g.zoneOf(rhino)).toBe('exile');
    expect(g.zoneOf(pick)).toBe('exile');
  });

  it('Arcanis draws three and can return to hand', () => {
    const g = game({
      p1: { battlefield: [...n('island', 4), 'arcanis-the-omnipotent'], library: n('forest', 3) },
    });
    const a = g.id('p1', 'arcanis-the-omnipotent');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: a,
      abilityIndex: 0,
      targets: [],
    }).passBoth();
    expect(g.state.players.p1.hand).toHaveLength(3);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: a,
      abilityIndex: 1,
      targets: [],
    }).passBoth();
    expect(g.zoneOf(a)).toBe('hand');
  });

  it('Gleaming Barrier leaves a Treasure', () => {
    const g = game({
      p1: { battlefield: ['gleaming-barrier'] },
      p2: { hand: ['bake-into-a-pie'], battlefield: n('swamp', 4) },
      active: 'p2',
    });
    cast(g, 'bake-into-a-pie', [g.ref(g.id('p1', 'gleaming-barrier'))])
      .passBoth()
      .passBoth();
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
    expect(tokens(g, 'food-token')).toHaveLength(1);
  });
});
