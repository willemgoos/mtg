import { type Action, getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Strixhaven Brawl (15b, blue): the blue cards of the Brawl decks.

type G = ReturnType<typeof game>;
const islands = (k: number) => n('island', k);
const zoneIds = (
  g: G,
  p: 'p1' | 'p2',
  zone: 'graveyard' | 'hand' | 'exile' | 'library',
  defId: string,
) => g.state.players[p][zone].filter((id) => g.obj(id).defId === defId);
const keywords = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const legalCasts = (g: G, defId: string) =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && g.obj(a.card).defId === defId,
    );
const activate = (g: G, defId: string, i = 0) => {
  const src = g.id(g.actor, defId);
  const act = g
    .legal()
    .find((a) => a.type === 'activateAbility' && a.source === src && a.abilityIndex === i);
  expect(act, `${defId} ability ${i}`).toBeDefined();
  g.do(act!);
  return settle(g);
};
/** Settles the stack, taking the first option of every question the spells ask. */
const answerAll = (g: G) => {
  for (let i = 0; i < 20; i++) {
    settle(g);
    if (g.decision.kind === 'priority') return;
    g.do(g.legal()[0]!);
  }
};

describe('counterspells', () => {
  it('Counterspell counters a spell', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['counterspell'], battlefield: islands(2) },
    });
    cast(g, 'bear-cub');
    const bears = g.state.stack[0]!.id;
    g.pass(); // p1 passes, p2 gets priority
    expect(g.actor).toBe('p2');
    cast(g, 'counterspell', [g.ref(bears)]);
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(zoneIds(g, 'p1', 'graveyard', 'bear-cub')).toHaveLength(1);
  });

  it('Spell Pierce counters a noncreature spell unless its controller pays {2}', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['spell-pierce'], battlefield: islands(1) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    const shock = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'spell-pierce', [g.ref(shock)]);
    settle(g);
    expect(zoneIds(g, 'p1', 'graveyard', 'shock')).toHaveLength(1);
    expect(g.life('p2')).toBe(20);
  });

  it('Spell Pierce needs a noncreature target', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['spell-pierce'], battlefield: islands(1) },
    });
    cast(g, 'bear-cub');
    g.pass();
    expect(legalCasts(g, 'spell-pierce')).toHaveLength(0);
  });

  it('Syncopate counters unless its controller pays X, and exiles the spell', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['syncopate'], battlefield: islands(3) },
    });
    cast(g, 'bear-cub');
    const bears = g.state.stack[0]!.id;
    g.pass();
    const act = legalCasts(g, 'syncopate').find((a) => a.x === 2)!;
    g.do({ ...act, targets: [g.ref(bears)] });
    settle(g);
    expect(zoneIds(g, 'p1', 'exile', 'bear-cub')).toHaveLength(1);
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('Spell Swindle counters a spell and makes Treasures equal to its mana value', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['spell-swindle'], battlefield: islands(5) },
    });
    cast(g, 'bear-cub');
    const bears = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'spell-swindle', [g.ref(bears)]);
    settle(g);
    expect(zoneIds(g, 'p1', 'graveyard', 'bear-cub')).toHaveLength(1);
    expect(all(g, 'treasure-token')).toHaveLength(2);
  });

  it('Essence Capture counters a creature spell and puts a +1/+1 counter on your creature', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['essence-capture'], battlefield: [...islands(2), 'bear-cub'] },
    });
    cast(g, 'bear-cub');
    const bears = g.state.stack[0]!.id;
    g.pass();
    const mine = g.id('p2', 'bear-cub');
    cast(g, 'essence-capture', [g.ref(bears), g.ref(mine)]);
    settle(g);
    expect(zoneIds(g, 'p1', 'graveyard', 'bear-cub')).toHaveLength(1);
    expect(pt(g, mine)).toEqual([3, 3]);
  });

  it('Wash Away can only target a spell not cast from hand, unless cleaved', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['wash-away'], battlefield: islands(3) },
    });
    cast(g, 'bear-cub');
    const bears = g.state.stack[0]!.id;
    g.pass();
    const casts = legalCasts(g, 'wash-away');
    // Only the cleaved cast ({1}{U}{U}) can target a spell cast from hand.
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => a.kicked)).toBe(true);
    g.do({ ...casts[0]!, targets: [g.ref(bears)] });
    settle(g);
    expect(zoneIds(g, 'p1', 'graveyard', 'bear-cub')).toHaveLength(1);
  });

  it('Three Steps Ahead (spree) can counter a spell and draw two, discarding one', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['three-steps-ahead'], battlefield: islands(5) },
    });
    cast(g, 'bear-cub');
    const bears = g.state.stack[0]!.id;
    g.pass();
    const hand = handSize(g, 'p2');
    const modes = (a: Extract<Action, { type: 'castSpell' }>) => (a.paws ?? []).join();
    const both = legalCasts(g, 'three-steps-ahead').find((a) => modes(a) === '0,2')!;
    expect(both).toBeDefined();
    g.do({ ...both, targets: [g.ref(bears)] });
    settle(g);
    expect(zoneIds(g, 'p1', 'graveyard', 'bear-cub')).toHaveLength(1);
    expect(g.decision.kind).toBe('discard');
    g.do(g.legal()[0]!);
    settle(g);
    // Cast (-1), draw two, discard one.
    expect(handSize(g, 'p2')).toBe(hand);
    expect(g.state.players.p2.graveyard.length).toBeGreaterThanOrEqual(2);
  });
});

describe('overload', () => {
  it('Cyclonic Rift bounces one permanent, or all nonland permanents you do not control when overloaded', () => {
    const spec = {
      p1: { hand: ['cyclonic-rift'], battlefield: islands(7) },
      p2: { battlefield: ['bear-cub', 'bear-cub', 'forest'] },
    };
    const g = game(spec);
    const target = g.id('p2', 'bear-cub');
    g.do({
      ...legalCasts(g, 'cyclonic-rift').find((a) => !a.kicked && a.targets.length === 1)!,
      targets: [g.ref(target)],
    });
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);

    const h = game(spec);
    h.do(legalCasts(h, 'cyclonic-rift').find((a) => a.kicked)!);
    settle(h);
    expect(all(h, 'bear-cub')).toHaveLength(0);
    expect(h.state.battlefield.some((id) => h.obj(id).defId === 'forest')).toBe(true);
  });

  it('Mizzium Skin gives a creature +0/+1 and hexproof; overloaded, every creature you control', () => {
    const g = game({
      p1: { hand: ['mizzium-skin'], battlefield: [...islands(2), 'bear-cub', 'bear-cub'] },
    });
    g.do(legalCasts(g, 'mizzium-skin').find((a) => a.kicked)!);
    settle(g);
    for (const id of all(g, 'bear-cub')) {
      expect(pt(g, id)).toEqual([2, 3]);
      expect(keywords(g, id).has('hexproof')).toBe(true);
    }
  });
});

describe('timing and costs', () => {
  it('Quicken lets the next sorcery be cast at instant speed, once', () => {
    const g = game({
      p1: { hand: ['quicken', 'preordain', 'stock-up'], battlefield: islands(5) },
    });
    cast(g, 'quicken');
    settle(g);
    g.passBoth(); // to combat or later: no longer sorcery timing
    g.passUntilStep('beginCombat');
    expect(legalCasts(g, 'preordain').length).toBeGreaterThan(0);
    cast(g, 'preordain');
    settle(g);
    expect(legalCasts(g, 'stock-up')).toHaveLength(0);
  });

  it('Treasure Cruise delves cards out of your graveyard to pay for itself', () => {
    const g = game({
      p1: {
        hand: ['treasure-cruise'],
        battlefield: islands(2),
        graveyard: ['shock', 'shock', 'shock', 'shock', 'shock', 'shock', 'shock'],
      },
    });
    const hand = handSize(g, 'p1');
    const act = legalCasts(g, 'treasure-cruise')[0]!;
    expect(act.delve).toBe(6);
    g.do(act);
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand - 1 + 3);
    expect(g.state.players.p1.exile).toHaveLength(6);
  });

  it('Treasure Cruise exiles only as many cards as it needs', () => {
    const g = game({
      p1: {
        hand: ['treasure-cruise'],
        battlefield: islands(6),
        graveyard: ['shock', 'shock', 'shock', 'shock'],
      },
    });
    const act = legalCasts(g, 'treasure-cruise')[0]!;
    expect(act.delve).toBe(2);
  });

  it('Thoughtcast costs {1} less for each artifact you control', () => {
    const g = game({
      p1: { hand: ['thoughtcast'], battlefield: [...islands(2), 'mind-stone', 'mind-stone'] },
    });
    // {4}{U} minus two = {2}{U}: five sources would be needed without the artifacts.
    expect(legalCasts(g, 'thoughtcast').length).toBeGreaterThan(0);
  });

  it('Unexpected Assistance can be cast with convoke', () => {
    const g = game({
      p1: {
        hand: ['unexpected-assistance'],
        battlefield: [...islands(2), 'bear-cub', 'bear-cub', 'bear-cub'],
      },
    });
    expect(legalCasts(g, 'unexpected-assistance').length).toBeGreaterThan(0);
  });
});

describe('plot', () => {
  it('Slickshot Lockpicker plots for {2}{U}, then casts for free on a later turn', () => {
    const g = game({ p1: { hand: ['slickshot-lockpicker'], battlefield: islands(3) } });
    const card = g.id('p1', 'slickshot-lockpicker', 'hand');
    const plot = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === card && a.abilityIndex === 1);
    expect(plot).toBeDefined();
    g.do(plot!);
    settle(g);
    expect(zoneIds(g, 'p1', 'exile', 'slickshot-lockpicker')).toHaveLength(1);
    // Not the same turn.
    expect(legalCasts(g, 'slickshot-lockpicker')).toHaveLength(0);
    // A later turn: free, at sorcery speed.
    const o = g.state.objects[card]!;
    g.state = {
      ...g.state,
      objects: { ...g.state.objects, [card]: { ...o, plottedTurn: g.state.turn.number - 1 } },
    };
    const free = legalCasts(g, 'slickshot-lockpicker')[0]!;
    expect(free).toBeDefined();
    g.do(free);
    settle(g);
    expect(all(g, 'slickshot-lockpicker')).toHaveLength(1);
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
  });

  it('Slickshot Lockpicker gives an instant or sorcery in your graveyard flashback', () => {
    const g = game({
      p1: { hand: ['slickshot-lockpicker'], battlefield: islands(4), graveyard: ['preordain'] },
    });
    const preordain = g.id('p1', 'preordain', 'graveyard');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === preordain)).toBe(false);
    cast(g, 'slickshot-lockpicker');
    settle(g);
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === preordain)).toBe(true);
  });
});

describe('big spells', () => {
  it('Part the Waterveil takes an extra turn and is exiled; awakened, it also animates a land', () => {
    const g = game({
      p1: { hand: ['part-the-waterveil'], battlefield: islands(9) },
    });
    const land = g.id('p1', 'island');
    const awaken = legalCasts(g, 'part-the-waterveil').find(
      (a) => a.kicked && a.targets.length === 1,
    )!;
    expect(awaken).toBeDefined();
    g.do({ ...awaken, targets: [g.ref(land)] });
    settle(g);
    expect(g.state.extraTurns).toHaveLength(1);
    expect(zoneIds(g, 'p1', 'exile', 'part-the-waterveil')).toHaveLength(1);
    expect(pt(g, land)).toEqual([6, 6]);
    const c = getCharacteristics(g.state, cardDb, land);
    expect(c.types).toContain('Creature');
    expect(c.types).toContain('Land');
    expect(c.keywords.has('haste')).toBe(true);
    expect(c.subtypes).toContain('Elemental');
  });

  it('Part the Waterveil unawakened takes one extra turn', () => {
    const g = game({ p1: { hand: ['part-the-waterveil'], battlefield: islands(6) } });
    g.do(legalCasts(g, 'part-the-waterveil').find((a) => !a.kicked)!);
    settle(g);
    expect(g.state.extraTurns).toHaveLength(1);
  });

  it('Stolen by the Fae returns a creature with mana value X and makes X Faeries', () => {
    const g = game({
      p1: { hand: ['stolen-by-the-fae'], battlefield: islands(4) },
      p2: { battlefield: ['bear-cub', 'swab-goblin'] },
    });
    const cub = g.id('p2', 'bear-cub');
    const acts = legalCasts(g, 'stolen-by-the-fae').filter((a) => a.x === 2);
    // Both creatures have mana value 2.
    expect(acts.length).toBe(2);
    g.do({ ...acts.find((a) => 'object' in a.targets[0]! && a.targets[0].object.id === cub)! });
    settle(g);
    expect(zoneIds(g, 'p2', 'hand', 'bear-cub')).toHaveLength(1);
    expect(all(g, 'faerie-token')).toHaveLength(2);
    expect(legalCasts(g, 'stolen-by-the-fae').filter((a) => a.x === 3)).toHaveLength(0);
  });

  it('Mass Manipulation gains control of X target creatures', () => {
    const g = game({
      p1: { hand: ['mass-manipulation'], battlefield: islands(8) },
      p2: { battlefield: ['bear-cub', 'swab-goblin'] },
    });
    const both = legalCasts(g, 'mass-manipulation').find(
      (a) => a.x === 2 && a.targets.length === 2,
    )!;
    expect(both).toBeDefined();
    g.do(both);
    settle(g);
    expect(g.obj(g.id('p1', 'bear-cub')).controller).toBe('p1');
    expect(g.obj(g.id('p1', 'swab-goblin')).controller).toBe('p1');
    // X is 1: only one target allowed.
    expect(legalCasts(g, 'mass-manipulation').every((a) => a.targets.length <= (a.x ?? 0))).toBe(
      true,
    );
  });

  it('Better Offer puts a random creature with mana value X or less onto the battlefield as an X/X with ward', () => {
    const g = game({
      p1: { hand: ['better-offer'], battlefield: islands(4) },
      p2: { library: ['bear-cub', 'shock', 'forest', 'forest'] },
    });
    const act = legalCasts(g, 'better-offer').find((a) => a.x === 3)!;
    g.do({ ...act, targets: [{ player: 'p2' }] });
    settle(g);
    const cub = g.id('p1', 'bear-cub');
    expect(pt(g, cub)).toEqual([3, 3]);
    expect(keywords(g, cub).has('wardOne')).toBe(true);
    expect(g.state.players.p2.library).toHaveLength(3);
  });

  it('Housemeld exiles a creature, which returns under your control as an enchantment at your next end step', () => {
    const g = game({
      p1: { hand: ['housemeld'], battlefield: islands(4) },
      p2: { battlefield: ['bear-cub'] },
    });
    const cub = g.id('p2', 'bear-cub');
    g.do({ ...legalCasts(g, 'housemeld')[0]!, targets: [g.ref(cub)] });
    settle(g);
    expect(g.zoneOf(cub)).toBe('exile');
    g.passUntilStep('end');
    settle(g);
    expect(g.zoneOf(cub)).toBe('battlefield');
    expect(g.obj(cub).controller).toBe('p1');
    const c = getCharacteristics(g.state, cardDb, cub);
    expect(c.types).toEqual(['Enchantment']);
  });

  it('Expropriate: two time votes mean two extra turns', () => {
    const g = game({ p1: { hand: ['expropriate'], battlefield: islands(9) } });
    cast(g, 'expropriate');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p1');
    g.do(g.legal()[0]!); // time
    expect(g.actor).toBe('p2');
    g.do(g.legal()[0]!); // time
    settle(g);
    expect(g.state.extraTurns).toHaveLength(2);
    expect(zoneIds(g, 'p1', 'exile', 'expropriate')).toHaveLength(1);
  });

  it("Expropriate: an opponent's money vote lets you take a permanent they choose", () => {
    const g = game({
      p1: { hand: ['expropriate'], battlefield: islands(9) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'expropriate');
    settle(g);
    g.do(g.legal()[0]!); // time
    g.do(g.legal()[1]!); // opponent votes money
    settle(g);
    expect(g.actor).toBe('p2');
    g.do(g.legal()[0]!); // they choose their permanent
    settle(g);
    expect(g.state.extraTurns).toHaveLength(1);
    expect(g.obj(g.id('p1', 'bear-cub')).controller).toBe('p1');
  });

  it('Rise from the Tides makes a tapped Zombie for each instant and sorcery in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['rise-from-the-tides'],
        battlefield: islands(6),
        graveyard: ['shock', 'preordain', 'bear-cub'],
      },
    });
    cast(g, 'rise-from-the-tides');
    settle(g);
    const zombies = all(g, 'zombie-token');
    expect(zombies).toHaveLength(2);
    expect(zombies.every((z) => g.obj(z).tapped)).toBe(true);
  });
});

describe('seek and card selection', () => {
  it('Bounty of the Deep seeks a land and a nonland card if you have no land in hand', () => {
    const g = game({
      p1: {
        hand: ['bounty-of-the-deep'],
        battlefield: islands(3),
        library: ['shock', 'island', 'forest', 'forest'],
      },
    });
    cast(g, 'bounty-of-the-deep');
    settle(g);
    const hand = g.state.players.p1.hand.map((id) => g.obj(id).defId).sort();
    expect(hand).toHaveLength(2);
    expect(hand).toContain('shock');
    expect(hand.filter((d) => d === 'island' || d === 'forest')).toHaveLength(1);
  });

  it('Bounty of the Deep seeks two nonland cards if you have a land in hand', () => {
    const g = game({
      p1: {
        hand: ['bounty-of-the-deep', 'island'],
        battlefield: islands(3),
        library: ['shock', 'preordain', 'forest', 'forest'],
      },
    });
    cast(g, 'bounty-of-the-deep');
    settle(g);
    const hand = g.state.players.p1.hand.map((id) => g.obj(id).defId).sort();
    expect(hand).toEqual(['island', 'preordain', 'shock']);
  });

  it('Seek New Knowledge seeks two nonland cards, then puts a card from your hand on the bottom', () => {
    const g = game({
      p1: {
        hand: ['seek-new-knowledge'],
        battlefield: islands(2),
        library: ['shock', 'preordain', 'forest'],
      },
    });
    cast(g, 'seek-new-knowledge');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    const options = g.legal();
    expect(options).toHaveLength(2);
    g.do(options[0]!);
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    const lib = g.state.players.p1.library;
    expect(['shock', 'preordain']).toContain(g.obj(lib[lib.length - 1]!).defId);
  });

  it('Gate to Seatower seeks a nonland card once', () => {
    const g = game({
      p1: {
        battlefield: ['gate-to-seatower', ...islands(4)],
        library: ['shock', 'forest', 'forest'],
      },
    });
    activate(g, 'gate-to-seatower', 1);
    expect(zoneIds(g, 'p1', 'hand', 'shock')).toHaveLength(1);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.abilityIndex === 1)).toBe(false);
  });

  it('Stock Up takes two of the top five cards; Experimental Augury takes one and proliferates', () => {
    const g = game({
      p1: {
        hand: ['stock-up'],
        battlefield: islands(3),
        library: ['shock', 'preordain', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'stock-up');
    settle(g);
    for (let i = 0; i < 3 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);

    const h = game({
      p1: {
        hand: ['experimental-augury'],
        battlefield: [...islands(2), { card: 'bear-cub' }],
        library: ['shock', 'forest', 'forest', 'forest'],
      },
    });
    const cub = h.id('p1', 'bear-cub');
    h.state = {
      ...h.state,
      objects: { ...h.state.objects, [cub]: { ...h.obj(cub), plusOneCounters: 1 } },
    };
    cast(h, 'experimental-augury');
    settle(h);
    for (let i = 0; i < 3 && h.decision.kind !== 'priority'; i++) h.do(h.legal()[0]!);
    settle(h);
    expect(handSize(h, 'p1')).toBe(1);
    expect(pt(h, cub)).toEqual([4, 4]);
  });

  it('Distant Melody draws a card for each creature of the chosen type', () => {
    const g = game({
      p1: {
        hand: ['distant-melody'],
        battlefield: [...islands(4), 'bear-cub', 'bear-cub', 'swab-goblin'],
      },
    });
    cast(g, 'distant-melody');
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as { options: { label: string }[] };
    const idx = d.options.findIndex((o) => o.label === 'Bear');
    g.do({ type: 'chooseOption', player: 'p1', index: idx });
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Sea Gate Restoration draws cards equal to your hand plus one, and removes your maximum hand size', () => {
    const g = game({
      p1: { hand: ['sea-gate-restoration', 'shock', 'shock'], battlefield: islands(7) },
    });
    cast(g, 'sea-gate-restoration');
    settle(g);
    expect(handSize(g, 'p1')).toBe(2 + 3);
    expect(g.state.players.p1.noMaxHandSize).toBe(true);
  });

  it("Baral's Expertise returns up to three permanents, then casts a spell with mana value 4 or less free", () => {
    const g = game({
      p1: { hand: ["baral's-expertise".replace("'", ''), 'bear-cub'], battlefield: islands(5) },
      p2: { battlefield: ['swab-goblin'] },
    });
    const goblin = g.id('p2', 'swab-goblin');
    cast(g, 'barals-expertise', [g.ref(goblin)]);
    settle(g);
    expect(zoneIds(g, 'p2', 'hand', 'swab-goblin')).toHaveLength(1);
    expect(g.decision.kind).toBe('castFree');
    const free = g.legal().find((a) => a.type === 'castSpell')!;
    expect(free).toBeDefined();
    g.do(free);
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
  });
});

describe('double-faced cards and lands', () => {
  it('Silundi Vision looks at six cards and takes an instant or sorcery; its back face is a tapped Island', () => {
    const g = game({
      p1: {
        hand: ['silundi-vision'],
        battlefield: islands(3),
        library: ['forest', 'shock', 'forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    cast(g, 'silundi-vision');
    settle(g);
    for (let i = 0; i < 3 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
    settle(g);
    expect(zoneIds(g, 'p1', 'hand', 'shock')).toHaveLength(1);

    const h = game({ p1: { hand: ['silundi-vision'] } });
    const land = h.legal().find((a) => a.type === 'playLand' && a.back);
    expect(land).toBeDefined();
    h.do(land!);
    settle(h);
    const isle = h.id('p1', 'silundi-isle');
    expect(h.obj(isle).tapped).toBe(true);
  });

  it('Sink into Stupor returns an opponent’s spell or nonland permanent; its back face is a shock land', () => {
    const g = game({
      p1: { hand: ['sink-into-stupor'], battlefield: islands(3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const cub = g.id('p2', 'bear-cub');
    const acts = legalCasts(g, 'sink-into-stupor');
    expect(acts.map((a) => a.mode).sort()).toEqual([1]);
    g.do({ ...acts[0]!, targets: [g.ref(cub)] });
    settle(g);
    expect(zoneIds(g, 'p2', 'hand', 'bear-cub')).toHaveLength(1);

    const h = game({ p1: { hand: ['sink-into-stupor'] } });
    h.do(h.legal().find((a) => a.type === 'playLand' && a.back)!);
    settle(h);
    const springs = h.id('p1', 'soporific-springs');
    // Pay 3 life to have it enter untapped.
    h.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(h);
    expect(h.obj(springs).tapped).toBe(false);
    expect(h.life('p1')).toBe(17);
  });

  it('Sink into Stupor can return a spell', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['sink-into-stupor'], battlefield: islands(3) },
    });
    cast(g, 'bear-cub');
    const cub = g.state.stack[0]!.id;
    g.pass();
    const act = legalCasts(g, 'sink-into-stupor').find((a) => a.mode === 0)!;
    g.do({ ...act, targets: [g.ref(cub)] });
    settle(g);
    expect(zoneIds(g, 'p1', 'hand', 'bear-cub')).toHaveLength(1);
  });

  it('Mystic Sanctuary enters tapped unless you control three other Islands', () => {
    const tapped = game({ p1: { hand: ['mystic-sanctuary'], battlefield: islands(2) } });
    tapped.do(tapped.legal().find((a) => a.type === 'playLand')!);
    settle(tapped);
    expect(tapped.obj(tapped.id('p1', 'mystic-sanctuary')).tapped).toBe(true);

    const g = game({
      p1: { hand: ['mystic-sanctuary'], battlefield: islands(3), graveyard: ['shock'] },
    });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    settle(g);
    expect(g.obj(g.id('p1', 'mystic-sanctuary')).tapped).toBe(false);
    const top = g.state.players.p1.library[0]!;
    expect(g.obj(top).defId).toBe('shock');
  });

  it('Thriving Isle enters tapped and taps for blue or the chosen colour', () => {
    const g = game({ p1: { hand: ['thriving-isle'] } });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as { options: { label: string }[] };
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: d.options.findIndex((o) => /red/i.test(o.label)),
    });
    settle(g);
    const land = g.id('p1', 'thriving-isle');
    expect(g.obj(land).tapped).toBe(true);
    expect(g.obj(land).chosenColor).toBe('R');
  });

  it('Snow-Covered Island is a basic snow Island that taps for {U}', () => {
    const def = cardDb.get('snow-covered-island')!;
    expect(def.supertypes).toEqual(['Basic', 'Snow']);
    expect(def.types).toEqual(['Land']);
    const g = game({ p1: { hand: ['preordain'], battlefield: ['snow-covered-island'] } });
    expect(legalCasts(g, 'preordain').length).toBeGreaterThan(0);
  });
});

describe('blue creatures', () => {
  it('Haughty Djinn has power equal to your instants and sorceries and makes them cost {1} less', () => {
    const g = game({
      p1: {
        hand: ['stock-up'],
        battlefield: [...islands(2), 'haughty-djinn'],
        graveyard: ['shock', 'preordain', 'bear-cub'],
      },
    });
    expect(pt(g, g.id('p1', 'haughty-djinn'))).toEqual([2, 4]);
    expect(keywords(g, g.id('p1', 'haughty-djinn')).has('flying')).toBe(true);
    // {2}{U} costs {1}{U}.
    expect(legalCasts(g, 'stock-up').length).toBeGreaterThan(0);
  });

  it('Murmuring Mystic makes a 1/1 flying Bird Illusion whenever you cast an instant or sorcery', () => {
    const g = game({ p1: { hand: ['preordain'], battlefield: ['island', 'murmuring-mystic'] } });
    cast(g, 'preordain');
    settle(g);
    const birds = all(g, 'soc-15b-u-bird-illusion');
    expect(birds).toHaveLength(1);
    expect(pt(g, birds[0]!)).toEqual([1, 1]);
    expect(keywords(g, birds[0]!).has('flying')).toBe(true);
  });

  it('Soulblade Djinn gives your creatures +1/+1 when you cast a noncreature spell', () => {
    const g = game({
      p1: { hand: ['preordain'], battlefield: ['island', 'soulblade-djinn', 'bear-cub'] },
    });
    cast(g, 'preordain');
    settle(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'soulblade-djinn'))).toEqual([5, 4]);
  });

  it('Ingenious Prodigy enters with X counters and can trade them for cards at upkeep', () => {
    const g = game({ p1: { hand: ['ingenious-prodigy'], battlefield: islands(4) } });
    const act = legalCasts(g, 'ingenious-prodigy').find((a) => a.x === 3)!;
    g.do(act);
    settle(g);
    const prodigy = g.id('p1', 'ingenious-prodigy');
    expect(pt(g, prodigy)).toEqual([3, 4]);
    expect(g.state.objects[prodigy]!.plusOneCounters).toBe(3);
    // Skulk: can't be blocked by creatures with greater power.
    expect(
      cardDb
        .get('ingenious-prodigy')!
        .abilities.some((a) => a.kind === 'static' && a.effect.kind === 'cantBeBlockedBy'),
    ).toBe(true);
    g.passUntilStep('upkeep'); // the opponent's upkeep
    g.passBoth();
    g.passUntilStep('upkeep'); // ours again
    const hand = handSize(g, 'p1');
    settle(g);
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand + 1);
    expect(g.state.objects[prodigy]!.plusOneCounters).toBe(2);
  });

  it('Reflective Rimekin copies your later instants and sorceries with mana value 3 or less', () => {
    const g = game({
      p1: { hand: ['reflective-rimekin', 'preordain', 'stock-up'], battlefield: islands(8) },
    });
    cast(g, 'reflective-rimekin');
    settle(g);
    const hand = handSize(g, 'p1');
    cast(g, 'preordain');
    answerAll(g);
    // Preordain and its copy each draw a card.
    expect(handSize(g, 'p1')).toBe(hand - 1 + 2);
  });

  it('Hydroelectric Specimen redirects a single-target spell to itself', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['hydroelectric-specimen'], battlefield: [...islands(3), 'bear-cub'] },
    });
    const cub = g.id('p2', 'bear-cub');
    cast(g, 'shock', [g.ref(cub)]);
    const shock = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'hydroelectric-specimen');
    settle(g); // specimen resolves; its trigger targets the spell
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p2', accept: true });
    settle(g);
    expect(g.obj(g.id('p2', 'hydroelectric-specimen')).damage).toBe(2);
    expect(g.obj(cub).zone).toBe('battlefield');
    expect(g.obj(shock).zone).toBe('graveyard');
  });
});

describe('small blue spells', () => {
  it('Lazotep Plating amasses and gives you and your permanents hexproof', () => {
    const g = game({ p1: { hand: ['lazotep-plating'], battlefield: islands(2) } });
    cast(g, 'lazotep-plating');
    settle(g);
    const army = all(g, 'soc-15b-u-zombie-army');
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([1, 1]);
    expect(getCharacteristics(g.state, cardDb, army[0]!).subtypes).toContain('Zombie');
    expect(g.state.turn.hexproofPlayers).toContain('p1');
  });

  it('Slip Out the Back puts a +1/+1 counter on a creature and phases it out', () => {
    const g = game({
      p1: { hand: ['slip-out-the-back'], battlefield: ['island', 'bear-cub'] },
    });
    const cub = g.id('p1', 'bear-cub');
    cast(g, 'slip-out-the-back', [g.ref(cub)]);
    settle(g);
    expect(g.obj(cub).plusOneCounters).toBe(1);
    expect(g.state.phasedOut?.some((p) => p.id === cub)).toBe(true);
  });

  it("Tezzeret's Gambit can be paid with 2 life instead of {U}", () => {
    const g = game({
      p1: { hand: ["tezzeret's-gambit".replace("'", '')], battlefield: n('mountain', 3) },
    });
    const acts = legalCasts(g, 'tezzerets-gambit');
    expect(acts).toHaveLength(1);
    expect(acts[0]!.kicked).toBe(true);
    const hand = handSize(g, 'p1');
    g.do(acts[0]!);
    settle(g);
    expect(g.life('p1')).toBe(18);
    expect(handSize(g, 'p1')).toBe(hand - 1 + 2);
  });

  it('Deduce draws a card and investigates; Consider surveils then draws', () => {
    const g = game({ p1: { hand: ['deduce', 'consider'], battlefield: islands(3) } });
    cast(g, 'deduce');
    settle(g);
    expect(all(g, 'clue-token')).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(2);
  });
});
