import {
  createEngine,
  redactFor,
  type Action,
  type CardDefinition,
  type ManaCost,
  type PlayerId,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// Tarkir: Dragonstorm (19a): how the bots handle omen, endure, harmonize and three-colour mana.

const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
  generic,
  colored,
});
function card(d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition {
  return {
    name: d.id,
    manaCost: cost(0),
    colors: [],
    types: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    ...d,
  };
}
const land = (
  id: string,
  produces: ('W' | 'U' | 'B' | 'R' | 'G')[],
  extra: Partial<CardDefinition> = {},
) =>
  card({
    id,
    types: ['Land'],
    supertypes: produces.length === 1 ? ['Basic'] : [],
    abilities: produces.map((p) => ({
      kind: 'mana' as const,
      cost: { tapSelf: true },
      produces: p,
    })),
    ...extra,
  });
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, colors: ['R'], ...extra });

const DB = new Map(
  [
    land('mountain', ['R']),
    land('plains', ['W']),
    land('swamp', ['B']),
    land('outpost', ['R', 'W', 'B'], { entersTapped: true }),
    creature('ogre', 3, 3),
    creature('tricolour', 3, 3, {
      colors: ['R', 'W', 'B'],
      manaCost: cost(0, { R: 1, W: 1, B: 1 }),
    }),
    // An Omen dragon: {4}{R} 4/4 flier, Omen {1}{R}: draw two cards.
    creature('omen-dragon', 4, 4, {
      manaCost: cost(4, { R: 1 }),
      subtypes: ['Dragon'],
      keywords: ['flying'],
      adventure: true,
      back: 'omen-draw',
    }),
    card({
      id: 'omen-draw',
      types: ['Sorcery'],
      subtypes: ['Omen'],
      colors: ['R'],
      manaCost: cost(1, { R: 1 }),
      spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 2 }] },
    }),
    // Dusyut Earthcarver-like: when this enters, it endures 3.
    creature('endurer', 1, 1, {
      colors: ['G'],
      manaCost: cost(1, { R: 1 }),
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [],
          effects: [{ kind: 'endure', amount: 2 }],
        },
      ],
    }),
    card({
      id: 'tdm-spirit-token',
      name: 'Spirit',
      isToken: true,
      colors: ['W'],
      types: ['Creature'],
      subtypes: ['Spirit'],
      power: 0,
      toughness: 0,
    }),
    // Wild Ride-like harmonize sorcery: {R}: 3 damage to target creature; harmonize {4}{R}.
    card({
      id: 'harm-bolt',
      types: ['Sorcery'],
      colors: ['R'],
      manaCost: cost(0, { R: 1 }),
      flashback: cost(4, { R: 1 }),
      harmonize: true,
      spell: {
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [{ kind: 'damage', amount: 3, to: { target: 0 } }],
      },
    }),
    creature('big', 4, 4),
    creature('enemy', 3, 3),
    // Mardu Devotee-like: "{1}: Add {R}, {W}, or {B}. Activate only once each turn."
    creature('devotee', 1, 1, {
      colors: ['W'],
      abilities: [
        {
          kind: 'activated',
          manaAbility: true,
          oncePerTurn: true,
          cost: { mana: cost(1) },
          targets: [],
          effects: [{ kind: 'addMana', mana: [['R', 'W', 'B']] }],
        },
      ],
    }),
  ].map((c) => [c.id, c]),
);

const engine = createEngine(DB);
const bot = createHeuristicBot(DB);
const game = (spec: ScenarioSpec) =>
  new GameDriver(
    engine,
    buildScenario(DB, {
      ...spec,
      p1: { library: Array<string>(10).fill('mountain'), ...spec.p1 },
      p2: { library: Array<string>(10).fill('mountain'), ...spec.p2 },
    }),
  );
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);

describe('bots and Omen', () => {
  it('casts the Omen side when the creature is out of reach', () => {
    const g = game({
      p1: { hand: ['omen-dragon'], battlefield: ['mountain', 'mountain'] },
      p2: {},
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type === 'castSpell') expect(a.back).toBe(true);
    g.do(a);
    g.passBoth();
    // Two cards drawn; the Dragon card is back in the library.
    expect(g.state.players.p1.hand.length).toBe(2);
    expect(
      g.state.players.p1.library.some((id) => g.state.objects[id]!.defId === 'omen-dragon'),
    ).toBe(true);
  });

  it('casts the creature rather than the Omen when it can', () => {
    const g = game({
      p1: { hand: ['omen-dragon'], battlefield: Array<string>(5).fill('mountain') },
      p2: {},
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type === 'castSpell') expect(a.back).toBeFalsy();
  });
});

describe('bots and Endure', () => {
  it('chooses one of the two ways to endure and goes on', () => {
    const g = game({ p1: { hand: ['endurer'], battlefield: ['mountain', 'mountain'] }, p2: {} });
    g.do(choose(g));
    g.passBoth(); // the creature resolves
    g.passBoth(); // the enter trigger resolves
    expect(g.decision.kind).toBe('chooseOption');
    const pick = choose(g);
    expect(pick.type).toBe('chooseOption');
    g.do(pick);
    expect(g.decision.kind).toBe('priority');
    // Either the endurer has two counters, or there is a Spirit beside it.
    const endurer = g.id('p1', 'endurer');
    const spirits = g.state.battlefield.filter(
      (id) => g.state.objects[id]!.defId === 'tdm-spirit-token',
    );
    expect(g.state.objects[endurer]!.plusOneCounters === 2 || spirits.length === 1).toBe(true);
  });
});

describe('bots and Harmonize', () => {
  const setup = (step: ScenarioSpec['step']) =>
    game({
      step,
      p1: {
        graveyard: ['harm-bolt'],
        battlefield: ['mountain', 'mountain', 'big'],
      },
      p2: { battlefield: ['enemy'] },
    });

  it('taps a creature to harmonize after combat', () => {
    const g = setup('main2');
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type === 'castSpell') expect(a.harmonizeTap).toBe(g.id('p1', 'big'));
    g.do(a);
    g.passBoth();
    expect(g.zoneOf(g.id('p2', 'enemy', 'graveyard'))).toBe('graveyard');
    expect(g.zoneOf(g.id('p1', 'harm-bolt', 'exile'))).toBe('exile');
  });

  it('does not tap an attacker before its own attack', () => {
    const g = setup('main1');
    const a = choose(g);
    expect(a.type === 'castSpell' && a.harmonizeTap).toBeFalsy();
  });
});

describe('bots and three-colour mana', () => {
  it('casts a three-colour spell with a tri-land covering a colour', () => {
    const g = game({
      p1: { hand: ['tricolour'], battlefield: [{ card: 'outpost' }, 'plains', 'swamp'] },
      p2: {},
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    g.do(a);
    g.passBoth();
    expect(g.zoneOf(g.id('p1', 'tricolour'))).toBe('battlefield');
  });

  it('plays the untapped basic that lets it cast now over the tapped tri-land', () => {
    const g = game({
      p1: { hand: ['tricolour', 'swamp', 'outpost'], battlefield: ['mountain', 'plains'] },
      p2: {},
    });
    const a = choose(g);
    expect(a.type).toBe('playLand');
    if (a.type === 'playLand') expect(g.state.objects[a.card]!.defId).toBe('swamp');
  });

  it('plays the tri-land first when nothing can be cast this turn anyway', () => {
    const g = game({
      p1: { hand: ['tricolour', 'swamp', 'outpost'], battlefield: ['mountain'] },
      p2: {},
    });
    const a = choose(g);
    expect(a.type).toBe('playLand');
    if (a.type === 'playLand') expect(g.state.objects[a.card]!.defId).toBe('outpost');
  });

  it('uses a Devotee to fix its colours when that lets it cast a spell', () => {
    const g = game({
      p1: { hand: ['tricolour'], battlefield: ['plains', 'plains', 'mountain', 'devotee'] },
      p2: {},
    });
    const first = choose(g);
    expect(first.type).toBe('activateAbility');
    g.do(first);
    const second = choose(g);
    expect(second.type).toBe('castSpell');
    g.do(second);
    g.passBoth();
    expect(g.zoneOf(g.id('p1', 'tricolour'))).toBe('battlefield');
  });

  it('does not waste the Devotee when nothing new can be cast', () => {
    const g = game({
      p1: { hand: ['tricolour'], battlefield: ['mountain', 'devotee'] },
      p2: {},
    });
    expect(choose(g).type).toBe('passPriority');
  });
});
