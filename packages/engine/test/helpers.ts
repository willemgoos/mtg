import { createEngine, type Engine } from '../src/engine.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type { CardDefinition, GameState, Keyword, ManaCost } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Fixture cards (engine tests don't depend on packages/cards)
// ---------------------------------------------------------------------------

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

function creature(
  id: string,
  p: number,
  t: number,
  keywords: Keyword[] = [],
  extra: Partial<CardDefinition> = {},
): CardDefinition {
  return card({
    id,
    types: ['Creature'],
    power: p,
    toughness: t,
    keywords,
    manaCost: cost(1),
    ...extra,
  });
}

export const FIXTURES: CardDefinition[] = [
  card({
    id: 'forest',
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }],
  }),
  card({
    id: 'mountain',
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'R' }],
  }),
  creature('bear', 2, 2, [], { manaCost: cost(1, { G: 1 }) }),
  creature('ogre', 3, 3),
  creature('wall', 0, 4),
  creature('zero', 0, 0),
  creature('flier', 2, 2, ['flying']),
  creature('spider', 1, 3, ['reach']),
  creature('trampler', 5, 5, ['trample']),
  creature('striker', 2, 2, ['firstStrike']),
  creature('double', 2, 2, ['doubleStrike']),
  creature('hasty', 3, 1, ['haste']),
  creature('vigilant', 2, 3, ['vigilance']),
  creature('assassin', 1, 1, ['deathtouch']),
  creature('dt-trampler', 3, 3, ['deathtouch', 'trample']),
  creature('lifelinker', 3, 3, ['lifelink']),
  creature('menacer', 3, 3, ['menace']),
  creature('elf', 1, 1, [], {
    subtypes: ['Elf'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }],
  }),
  creature('firebreather', 2, 2, [], {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(0, { R: 1 }) },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  }),
  creature('pinger', 1, 1, [], {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: 1, to: { target: 0 } }],
      },
    ],
  }),
  creature('sacker', 3, 2, [], {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(0, { R: 1 }), sacrificeSelf: true },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'damage', amount: { powerOf: 'self' }, to: { target: 0 } }],
      },
    ],
  }),
  creature('pyromancer', 2, 1, [], {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
      },
    ],
  }),
  creature('prowler', 1, 1, [], {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }],
      },
    ],
  }),
  creature('wurm', 7, 7, [], {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  creature('landfaller', 1, 1, [], {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  }),
  creature('elf-lord', 2, 2, [], {
    subtypes: ['Elf'],
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Elf' },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  creature('fighter', 4, 4, [], {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [{ kind: 'fight', a: 'self', b: { target: 0 } }],
      },
    ],
  }),
  creature('hydra', 0, 0, [], { entersWithCounters: 4 }),
  creature('upkeeper', 5, 5, [], {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'controller' }],
      },
    ],
  }),
  card({
    id: 'shock',
    types: ['Instant'],
    manaCost: cost(0, { R: 1 }),
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
    },
  }),
  card({
    id: 'lava-axe',
    types: ['Sorcery'],
    manaCost: cost(4, { R: 1 }),
    spell: {
      targets: [{ what: 'player' }],
      effects: [{ kind: 'damage', amount: 5, to: { target: 0 } }],
    },
  }),
  card({
    id: 'giant-growth',
    types: ['Instant'],
    manaCost: cost(0, { G: 1 }),
    spell: {
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'pump', to: { target: 0 }, power: 3, toughness: 3 }],
    },
  }),
  card({
    id: 'veil',
    types: ['Instant'],
    manaCost: cost(0, { G: 1 }),
    spell: {
      targets: [{ what: 'creature', controller: 'you' }],
      effects: [
        { kind: 'counters', to: { target: 0 }, amount: 1 },
        { kind: 'pump', to: { target: 0 }, power: 0, toughness: 0, keywords: ['hexproof'] },
      ],
    },
  }),
  card({
    id: 'bite',
    types: ['Instant'],
    manaCost: cost(1, { G: 1 }),
    spell: {
      targets: [
        { what: 'creature', controller: 'you' },
        { what: 'creature', controller: 'opponent' },
      ],
      effects: [
        {
          kind: 'damage',
          amount: { powerOf: { target: 0 } },
          from: { target: 0 },
          to: { target: 1 },
        },
      ],
    },
  }),
  card({
    id: 'rupture',
    types: ['Sorcery'],
    manaCost: cost(2, { R: 1 }),
    spell: {
      targets: [],
      effects: [
        { kind: 'damage', amount: 2, to: { each: 'creature', filter: { lacksKeyword: 'flying' } } },
      ],
    },
  }),
  card({
    id: 'fodder',
    types: ['Sorcery'],
    manaCost: cost(1, { R: 1 }),
    spell: { targets: [], effects: [{ kind: 'createToken', token: 'goblin', count: 2 }] },
  }),
  creature('goblin', 1, 1, [], { isToken: true }),
  card({
    id: 'gate',
    types: ['Land'],
    entersTapped: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
    ],
  }),
  card({
    id: 'temple',
    types: ['Land'],
    entersTapped: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
      },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
    ],
  }),
  card({
    id: 'peek',
    types: ['Instant'],
    manaCost: cost(0, { R: 1 }),
    spell: {
      targets: [],
      effects: [
        { kind: 'scry', amount: 2 },
        { kind: 'draw', who: 'controller', amount: 1 },
      ],
    },
  }),
  creature('gruul-bear', 3, 3, [], { manaCost: cost(0, { R: 1, G: 1 }) }),
  creature('big-gruul', 5, 5, [], { manaCost: cost(1, { R: 2, G: 1 }) }),
  creature('legend', 2, 2, [], { supertypes: ['Legendary'] }),
];

export const DB = new Map(FIXTURES.map((c) => [c.id, c]));
export const engine: Engine = createEngine(DB);

export type { PlayerSpec, ScenarioSpec } from '../src/testing.ts';

/** p1's main phase on turn 3 unless specified; fixture card database. */
export function scenario(spec: ScenarioSpec = {}): GameState {
  return buildScenario(DB, spec);
}

export class Game extends GameDriver {
  constructor(state: GameState) {
    super(engine, state);
  }
}
