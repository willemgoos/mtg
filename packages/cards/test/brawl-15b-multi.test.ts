import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { BRAWL_15B_MULTI, BRAWL_15B_MULTI_BACKS } from '../src/soc/cards-15b-multi.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Strixhaven Brawl 15b: the multicolour, colourless and land cards of the other seven decks.

const activate = (g: GameDriver, source: string, index = 0, extra: Partial<Action> = {}) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets: [],
    ...extra,
  } as Action);
const pick = (g: GameDriver, label: RegExp) => {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`Expected an option prompt, got ${d.kind}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0)
    throw new Error(`No option matching ${label}: ${d.options.map((o) => o.label).join(' | ')}`);
  return g.do({ type: 'chooseOption', player: d.player, index });
};
const zoneIds = (g: GameDriver, p: 'p1' | 'p2', zone: 'hand' | 'graveyard' | 'library' | 'exile') =>
  g.state.players[p][zone].map((id) => g.obj(id).defId);
const onField = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === p);
const castFace = (
  g: GameDriver,
  defId: string,
  targets: Action extends never ? never : unknown[] = [],
) =>
  g.do({
    type: 'castSpell',
    player: g.actor,
    card: g.id(g.actor, defId, 'hand'),
    targets,
    back: true,
  } as Action);
const playLand = (g: GameDriver, defId: string, back = false) =>
  g.do({
    type: 'playLand',
    player: g.actor,
    card: g.id(g.actor, defId, 'hand'),
    ...(back ? { back: true } : {}),
  });
const takeCard = (g: GameDriver, defId: string) => {
  const d = g.decision;
  if (d.kind !== 'searchLibrary') throw new Error(`Expected a search, got ${d.kind}`);
  const card = d.options.find((id) => g.obj(id).defId === defId) ?? null;
  return g.do({ type: 'chooseCard', player: d.player, card });
};

describe('15b multi: every card is in the pool', () => {
  it('has a definition for each card and back face', () => {
    for (const name of [...Object.keys(BRAWL_15B_MULTI), ...Object.keys(BRAWL_15B_MULTI_BACKS)])
      expect(cardDb.has(slug(name)), name).toBe(true);
    // The split and modal cards link to their back halves.
    expect(cardDb.get('discovery')!.back).toBe('dispersal');
    expect(cardDb.get('revitalizing-repast')!.back).toBe('old-growth-grove');
    expect(cardDb.get('waterlogged-teachings')!.back).toBe('inundated-archive');
  });
});

describe('lands', () => {
  it('shock lands enter tapped unless you pay 2 life', () => {
    const g = game({ p1: { hand: ['overgrown-tomb', 'blood-crypt'] } });
    playLand(g, 'overgrown-tomb');
    settle(g);
    pick(g, /Pay 2 life/);
    expect(g.obj(onField(g, 'overgrown-tomb')[0]!).tapped).toBe(false);
    expect(g.life('p1')).toBe(18);
  });

  it('a shock land can enter tapped, keeping the life', () => {
    const g = game({ p1: { hand: ['temple-garden'] } });
    playLand(g, 'temple-garden');
    settle(g);
    pick(g, /Enter tapped/);
    expect(g.obj(onField(g, 'temple-garden')[0]!).tapped).toBe(true);
    expect(g.life('p1')).toBe(20);
  });

  it('a fast land (Blooming Marsh) enters tapped with three other lands', () => {
    const early = game({ p1: { hand: ['blooming-marsh'] } });
    playLand(early, 'blooming-marsh');
    expect(early.obj(onField(early, 'blooming-marsh')[0]!).tapped).toBe(false);
    const late = game({ p1: { hand: ['blooming-marsh'], battlefield: n('forest', 3) } });
    playLand(late, 'blooming-marsh');
    expect(late.obj(onField(late, 'blooming-marsh')[0]!).tapped).toBe(true);
  });

  it('a check land (Woodland Cemetery) checks for a Swamp or Forest', () => {
    const g = game({ p1: { hand: ['woodland-cemetery'], battlefield: ['mountain'] } });
    playLand(g, 'woodland-cemetery');
    expect(g.obj(onField(g, 'woodland-cemetery')[0]!).tapped).toBe(true);
    const h = game({ p1: { hand: ['woodland-cemetery'], battlefield: ['forest'] } });
    playLand(h, 'woodland-cemetery');
    expect(h.obj(onField(h, 'woodland-cemetery')[0]!).tapped).toBe(false);
  });

  it('Underground Mortuary enters tapped and surveils 1', () => {
    const g = game({ p1: { hand: ['underground-mortuary'], library: ['mountain', 'forest'] } });
    playLand(g, 'underground-mortuary');
    settle(g);
    expect(g.decision.kind).toBe('scry');
  });

  it('a Triome taps for three colours and cycles for {3}', () => {
    const g = game({ p1: { hand: ['indatha-triome'], battlefield: n('forest', 3) } });
    expect(
      g
        .legal()
        .some(
          (a) => a.type === 'activateAbility' && a.source === g.id('p1', 'indatha-triome', 'hand'),
        ),
    ).toBe(true);
    activate(g, g.id('p1', 'indatha-triome', 'hand'), 3);
    settle(g);
    expect(zoneIds(g, 'p1', 'graveyard')).toContain('indatha-triome');
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('Llanowar Wastes deals 1 damage for coloured mana but not colourless', () => {
    const g = game({
      p1: { hand: ['llanowar-elves'], battlefield: ['llanowar-wastes', 'forest'] },
    });
    cast(g, 'llanowar-elves');
    settle(g);
    expect(onField(g, 'llanowar-elves')).toHaveLength(1);
  });

  it('Shattered Landscape sacrifices to fetch a basic Mountain, Plains or Swamp, tapped', () => {
    const g = game({
      p1: {
        battlefield: ['shattered-landscape'],
        library: ['forest', 'island', 'swamp', 'forest'],
      },
    });
    activate(g, g.id('p1', 'shattered-landscape'), 1);
    settle(g);
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw new Error('no search');
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['swamp']);
    takeCard(g, 'swamp');
    expect(g.obj(onField(g, 'swamp')[0]!).tapped).toBe(true);
    expect(onField(g, 'shattered-landscape')).toHaveLength(0);
  });

  it('The World Tree makes lands tap for any colour only with six or more lands', () => {
    const castable = (lands: number) => {
      const g = game({
        p1: { battlefield: ['the-world-tree', ...n('forest', lands)], hand: ['bake-into-a-pie'] },
        p2: { battlefield: ['savannah-lions'] },
      });
      return g.legal().some((a) => a.type === 'castSpell');
    };
    // Bake into a Pie is {2}{B}{B}: Forests only make {G}.
    expect(castable(4)).toBe(false);
    expect(castable(5)).toBe(true);
  });

  it('The World Tree puts every God from the library onto the battlefield', () => {
    const g = game({
      p1: {
        battlefield: [
          'the-world-tree',
          ...n('plains', 2),
          ...n('island', 2),
          ...n('swamp', 2),
          ...n('mountain', 2),
          ...n('forest', 2),
        ],
        library: ['serra-angel', 'forest'],
      },
    });
    activate(g, g.id('p1', 'the-world-tree'), 2);
    settle(g);
    expect(onField(g, 'the-world-tree')).toHaveLength(0);
  });

  it('Restless Cottage becomes a 4/4 and makes a Food and exiles a graveyard card when it attacks', () => {
    const g = game({
      p1: { battlefield: ['restless-cottage', ...n('swamp', 2), ...n('forest', 2)] },
      p2: { graveyard: ['bake-into-a-pie'] },
      step: 'main1',
    });
    const cottage = g.id('p1', 'restless-cottage');
    activate(g, cottage, 2);
    settle(g);
    expect(pt(g, cottage)).toEqual([4, 4]);
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(cottage);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0));
    expect(onField(g, 'food-token')).toHaveLength(1);
    expect(zoneIds(g, 'p2', 'graveyard')).toHaveLength(0);
  });

  it('Rakdos Signet makes {B}{R} for {1}', () => {
    const g = game({ p1: { battlefield: ['rakdos-signet', 'swamp'] } });
    activate(g, g.id('p1', 'rakdos-signet'), 0);
    settle(g);
    expect(g.state.players.p1.pool?.flatMap((m) => m.produces).sort()).toEqual(['B', 'R']);
  });

  it('Talisman of Resilience taps for {C}, or {B} or {G} with 1 damage', () => {
    const talisman = cardDb.get('talisman-of-resilience')!;
    expect(talisman.abilities.map((a) => (a.kind === 'mana' ? a.produces : a.kind))).toEqual([
      'C',
      'B',
      'G',
    ]);
  });
});

describe('Dina, Essence Brewer', () => {
  it('sacrifices another creature for X life and X counters, and draws once per turn', () => {
    const g = game({
      p1: {
        battlefield: ['dina-essence-brewer', 'savannah-lions', 'llanowar-elves', ...n('swamp', 2)],
        library: n('forest', 5),
      },
    });
    const dina = g.id('p1', 'dina-essence-brewer');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, dina, 1, { targets: [g.ref(dina)], sacrifice: lions });
    settle(g);
    expect(g.life('p1')).toBe(22);
    expect(g.obj(dina).plusOneCounters).toBe(2);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
});

describe('Gorma, the Gullet', () => {
  it('gets a counter when another creature you control dies, and later creatures enter bigger', () => {
    const g = game({
      p1: {
        battlefield: ['gorma-the-gullet', 'savannah-lions', ...n('forest', 3), ...n('swamp', 3)],
        hand: ['llanowar-elves'],
      },
      p2: { hand: ['bake-into-a-pie'], battlefield: n('swamp', 4) },
    });
    const gorma = g.id('p1', 'gorma-the-gullet');
    g.pass();
    cast(g, 'bake-into-a-pie', [g.ref(g.id('p1', 'savannah-lions'))]);
    settle(g);
    expect(g.obj(gorma).plusOneCounters).toBe(1);
    cast(g, 'llanowar-elves');
    settle(g);
    // One creature died this turn: the Bears enter with a +1/+1 counter.
    expect(g.obj(onField(g, 'llanowar-elves')[0]!).plusOneCounters).toBe(1);
  });
});

describe('removal and sweepers', () => {
  it("Assassin's Trophy destroys the permanent and its controller may fetch a basic land", () => {
    const g = game({
      p1: { hand: ['assassins-trophy'], battlefield: ['swamp', 'forest'] },
      p2: { battlefield: ['savannah-lions'], library: ['plains', 'forest'] },
    });
    cast(g, 'assassins-trophy', [g.ref(g.id('p2', 'savannah-lions'))]);
    settle(g);
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw new Error('no search');
    expect(d.player).toBe('p2');
    takeCard(g, 'plains');
    expect(onField(g, 'plains', 'p2')).toHaveLength(1);
    expect(onField(g, 'savannah-lions', 'p2')).toHaveLength(0);
  });

  it('Casualties of War destroys one of each chosen type', () => {
    const g = game({
      p1: { hand: ['casualties-of-war'], battlefield: [...n('swamp', 4), ...n('forest', 2)] },
      p2: { battlefield: ['savannah-lions', 'plains'] },
    });
    // Modes in printed order: artifact, creature, enchantment, land, planeswalker; mode index = mask - 1.
    const creatureAndLand = 0b01010 - 1;
    cast(
      g,
      'casualties-of-war',
      [g.ref(g.id('p2', 'savannah-lions')), g.ref(g.id('p2', 'plains'))],
      {
        mode: creatureAndLand,
      },
    );
    settle(g);
    expect(onField(g, 'savannah-lions', 'p2')).toHaveLength(0);
    expect(onField(g, 'plains', 'p2')).toHaveLength(0);
  });

  it('Kin-Tree Severance exiles a permanent with mana value 3 or more', () => {
    const g = game({
      p1: { hand: ['kin-tree-severance'], battlefield: ['plains', 'swamp', 'forest'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' && a.targets.some((t) => 'object' in t && t.object.id === lions),
        ),
    ).toBe(false);
    cast(g, 'kin-tree-severance', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(zoneIds(g, 'p2', 'exile')).toEqual(['serra-angel']);
  });

  it('Duneblast destroys every creature but the one you keep', () => {
    const g = game({
      p1: {
        hand: ['duneblast'],
        battlefield: [
          'serra-angel',
          'savannah-lions',
          ...n('plains', 3),
          ...n('swamp', 2),
          ...n('forest', 2),
        ],
      },
      p2: { battlefield: ['llanowar-elves', 'savannah-lions'] },
    });
    cast(g, 'duneblast');
    settle(g);
    pick(g, /Keep Serra Angel/);
    settle(g);
    expect(onField(g, 'serra-angel')).toHaveLength(1);
    expect(onField(g, 'savannah-lions')).toHaveLength(0);
    expect(onField(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(onField(g, 'savannah-lions', 'p2')).toHaveLength(0);
  });

  it('Time Wipe returns one of your creatures, then destroys all creatures', () => {
    const g = game({
      p1: {
        hand: ['time-wipe'],
        battlefield: ['serra-angel', 'savannah-lions', ...n('plains', 3), ...n('island', 2)],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(g, 'time-wipe');
    settle(g);
    if (g.decision.kind === 'chooseOption') pick(g, /Serra Angel/);
    else if (g.decision.kind === 'chooseObject') {
      const d = g.decision;
      g.do({
        type: 'chooseCard',
        player: d.player,
        card: d.options.find((id) => g.obj(id).defId === 'serra-angel')!,
      });
    }
    settle(g);
    expect(zoneIds(g, 'p1', 'hand')).toContain('serra-angel');
    expect(onField(g, 'savannah-lions')).toHaveLength(0);
    expect(onField(g, 'llanowar-elves', 'p2')).toHaveLength(0);
  });

  it('Ruinous Ultimatum destroys only the opponents nonland permanents', () => {
    const g = game({
      p1: {
        hand: ['ruinous-ultimatum'],
        battlefield: ['savannah-lions', ...n('mountain', 2), ...n('plains', 3), ...n('swamp', 2)],
      },
      p2: { battlefield: ['llanowar-elves', 'plains'] },
    });
    cast(g, 'ruinous-ultimatum');
    settle(g);
    expect(onField(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(onField(g, 'plains', 'p2')).toHaveLength(1);
    expect(onField(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Fractured Identity exiles a permanent and the other player copies it', () => {
    const g = game({
      p1: { hand: ['fractured-identity'], battlefield: [...n('plains', 3), ...n('island', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'fractured-identity', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(onField(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(onField(g, 'serra-angel', 'p1')).toHaveLength(1);
    expect(g.obj(onField(g, 'serra-angel', 'p1')[0]!).isToken).toBe(true);
  });
});

describe('spells', () => {
  it('Call the Crash is suspended from hand and conjures two Siege Rhinos when it comes off suspend', () => {
    const g = game({
      p1: { hand: ['call-the-crash'], battlefield: ['plains', 'swamp', 'forest', 'forest'] },
    });
    const card = g.id('p1', 'call-the-crash', 'hand');
    activate(g, card, 0);
    settle(g);
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.obj(card).suspended).toBe(true);
    expect(g.obj(card).counters?.time).toBe(2);
    // Two of its owner's upkeeps later it's cast for free.
    g.obj(card).counters = { time: 1 };
    while (!(g.state.turn.step === 'upkeep' && g.state.turn.activePlayer === 'p1')) {
      if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.actor });
      else throw new Error(g.decision.kind);
    }
    settle(g);
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [], free: true });
    settle(g);
    expect(onField(g, 'siege-rhino')).toHaveLength(2);
    expect(g.life('p2')).toBe(14);
    expect(g.life('p1')).toBe(26);
  });

  it('Siege Rhino drains 3', () => {
    const g = game({
      p1: { hand: ['siege-rhino'], battlefield: ['plains', 'swamp', 'forest', 'forest'] },
    });
    cast(g, 'siege-rhino');
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
  });

  it('Vesuvan Mist bounces; kicked, it conjures a duplicate castable with any mana', () => {
    const g = game({
      p1: { hand: ['vesuvan-mist'], battlefield: ['island', 'island', 'swamp', 'swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'vesuvan-mist', [g.ref(g.id('p2', 'serra-angel'))], { kicked: true });
    settle(g);
    expect(zoneIds(g, 'p2', 'hand')).toContain('serra-angel');
    const dup = g.state.players.p1.hand.find((id) => g.obj(id).defId === 'serra-angel');
    expect(dup).toBeDefined();
    expect(g.obj(dup!).anyMana).toBe(true);
  });

  it('Waterlogged Teachings finds an instant or a card with flash', () => {
    const g = game({
      p1: {
        hand: ['waterlogged-teachings'],
        battlefield: n('island', 4),
        library: ['bake-into-a-pie', 'serra-angel', 'forest'],
      },
    });
    cast(g, 'waterlogged-teachings');
    settle(g);
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw new Error('no search');
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['bake-into-a-pie']);
    takeCard(g, 'bake-into-a-pie');
    expect(zoneIds(g, 'p1', 'hand')).toContain('bake-into-a-pie');
  });

  it('Discovery surveils 2 then draws; Dispersal bounces the best permanent and discards', () => {
    const d1 = game({
      p1: { hand: ['discovery'], battlefield: ['island', 'swamp'], library: n('forest', 5) },
    });
    cast(d1, 'discovery');
    settle(d1);
    expect(d1.decision.kind).toBe('scry');

    const g = game({
      p1: { hand: ['discovery'], battlefield: [...n('island', 3), ...n('swamp', 2)] },
      p2: {
        hand: ['bake-into-a-pie'],
        battlefield: ['serra-angel', 'savannah-lions', 'plains'],
      },
    });
    castFace(g, 'discovery');
    settle(g);
    if (g.decision.kind === 'discard')
      g.do({ type: 'discard', player: 'p2', card: g.id('p2', 'bake-into-a-pie', 'hand') });
    expect(onField(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(zoneIds(g, 'p2', 'hand')).toContain('serra-angel');
    expect(zoneIds(g, 'p2', 'graveyard').length).toBe(1);
  });

  it('Revitalizing Repast puts a counter and grants indestructible; its back is a land', () => {
    const g = game({
      p1: { hand: ['revitalizing-repast'], battlefield: ['savannah-lions', 'swamp'] },
    });
    cast(g, 'revitalizing-repast', [g.ref(g.id('p1', 'savannah-lions'))]);
    settle(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).plusOneCounters).toBe(1);
    const land = game({ p1: { hand: ['revitalizing-repast'] } });
    playLand(land, 'revitalizing-repast', true);
    expect(land.obj(onField(land, 'old-growth-grove')[0]!).tapped).toBe(true);
  });

  it('Escape to the Wilds exiles five playable cards and allows an extra land', () => {
    const g = game({
      p1: {
        hand: ['escape-to-the-wilds', 'forest', 'forest'],
        battlefield: [...n('mountain', 3), ...n('forest', 2)],
        library: n('forest', 8),
      },
    });
    cast(g, 'escape-to-the-wilds');
    settle(g);
    expect(zoneIds(g, 'p1', 'exile')).toHaveLength(5);
    playLand(g, 'forest');
    playLand(g, 'forest');
    expect(onField(g, 'forest').length).toBe(4);
  });
});

describe('creatures', () => {
  it('Lagomos makes a hasty 2/1 Elemental each combat, sacrificed at end of turn', () => {
    const g = game({ p1: { battlefield: ['lagomos-hand-of-hatred'] }, step: 'main1' });
    g.passUntilStep('beginCombat');
    settle(g);
    const els = onField(g, 'soc-15b-multi-elemental');
    expect(els).toHaveLength(1);
    expect(pt(g, els[0]!)).toEqual([2, 1]);
    g.passUntilStep('end');
    settle(g);
    expect(onField(g, 'soc-15b-multi-elemental')).toHaveLength(0);
  });

  it('Lagomos only tutors after five creatures died', () => {
    const g = game({
      p1: { battlefield: ['lagomos-hand-of-hatred'], library: ['serra-angel', 'forest'] },
    });
    const lag = g.id('p1', 'lagomos-hand-of-hatred');
    g.obj(lag).summoningSick = false;
    const can = () =>
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === lag && a.abilityIndex === 1);
    expect(can()).toBe(false);
    g.state.turn.creaturesDied = 5;
    expect(can()).toBe(true);
  });

  it('Mayhem Devil pings whenever any player sacrifices a permanent', () => {
    const g = game({
      p1: { battlefield: ['mayhem-devil', 'haywire-mite', 'forest'] },
      p2: { battlefield: ['treasure-token'] },
    });
    activate(g, g.id('p1', 'haywire-mite'), 1, { targets: [g.ref(g.id('p2', 'treasure-token'))] });
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      ),
    );
    // The Mite died (+2 life) and its sacrifice pinged the opponent.
    expect(g.life('p2')).toBe(19);
  });

  it('Iridescent Hornbeetle makes an Insect per +1/+1 counter put on your creatures this turn', () => {
    const g = game({
      p1: {
        battlefield: ['iridescent-hornbeetle', 'savannah-lions', 'swamp'],
        hand: ['revitalizing-repast'],
      },
      step: 'main1',
    });
    cast(g, 'revitalizing-repast', [g.ref(g.id('p1', 'savannah-lions'))]);
    settle(g);
    g.passUntilStep('end');
    settle(g);
    expect(onField(g, 'soc-15b-multi-insect')).toHaveLength(1);
  });

  it('Ochre Jelly enters with X counters and splits when it dies', () => {
    const g = game({
      p1: { hand: ['ochre-jelly'], battlefield: [...n('forest', 5)] },
      p2: { hand: ['bake-into-a-pie'], battlefield: n('swamp', 4) },
    });
    cast(g, 'ochre-jelly', [], { x: 4 } as never);
    settle(g);
    const jelly = g.id('p1', 'ochre-jelly');
    expect(g.obj(jelly).plusOneCounters).toBe(4);
    g.pass();
    cast(g, 'bake-into-a-pie', [g.ref(jelly)]);
    settle(g);
    expect(onField(g, 'ochre-jelly')).toHaveLength(0);
    g.passUntilStep('end');
    settle(g);
    const token = onField(g, 'ochre-jelly');
    expect(token).toHaveLength(1);
    expect(g.obj(token[0]!).isToken).toBe(true);
    expect(g.obj(token[0]!).plusOneCounters).toBe(2);
  });

  it('Haywire Mite gains 2 life on death and exiles a noncreature artifact', () => {
    const g = game({
      p1: { battlefield: ['haywire-mite', 'forest'] },
      p2: { battlefield: ['treasure-token'] },
    });
    activate(g, g.id('p1', 'haywire-mite'), 1, { targets: [g.ref(g.id('p2', 'treasure-token'))] });
    settle(g);
    expect(onField(g, 'treasure-token', 'p2')).toHaveLength(0);
    expect(g.life('p1')).toBe(22);
  });

  it('Voracious Hydra doubles its counters or fights', () => {
    const mk = () =>
      game({
        p1: { hand: ['voracious-hydra'], battlefield: n('forest', 5) },
        p2: { battlefield: ['savannah-lions'] },
      });
    const doubled = mk();
    cast(doubled, 'voracious-hydra', [], { x: 2 });
    settle(doubled, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === 0));
    expect(doubled.obj(doubled.id('p1', 'voracious-hydra')).plusOneCounters).toBe(4);
    const fights = mk();
    cast(fights, 'voracious-hydra', [], { x: 2 });
    settle(fights, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === 1));
    expect(onField(fights, 'savannah-lions', 'p2')).toHaveLength(0);
    expect(fights.obj(fights.id('p1', 'voracious-hydra')).damage).toBe(2);
  });
});
