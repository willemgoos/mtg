import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from './build.ts';

// Helpers for the common shapes.
const t0 = { target: 0 } as const;
const t1 = { target: 1 } as const;
const anyTarget: TargetSpec = { what: 'any' };
const creature: TargetSpec = { what: 'creature' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const cost = (generic: number, R = 0, G = 0) => ({
  generic,
  colored: { ...(R ? { R } : {}), ...(G ? { G } : {}) },
});

const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});
const burn = (n: number, target: TargetSpec = anyTarget) =>
  spell([target], { kind: 'damage', amount: n, to: t0 });
const pump = (p: number, t: number, keywords: CardDefinition['keywords'] = []) =>
  spell([creature], { kind: 'pump', to: t0, power: p, toughness: t, keywords });

/**
 * Behavior for each card, keyed by exact card name. Printed characteristics
 * (cost, types, P/T, keywords) come from Scryfall; only rules text lives here.
 */
export const BEHAVIORS: Record<string, Behavior> = {
  // ---------------------------------------------------------------- red
  Shock: burn(2),
  'Lightning Strike': burn(3),
  Boltwave: spell([], { kind: 'damage', amount: 3, to: 'eachOpponent' }),
  'Kindled Fury': pump(1, 0, ['firstStrike']),
  'Sure Strike': pump(3, 0, ['firstStrike']),
  'Crash Through': spell(
    [],
    {
      kind: 'pump',
      to: { each: 'creature', controller: 'you' },
      power: 0,
      toughness: 0,
      keywords: ['trample'],
    },
    { kind: 'draw', who: 'controller', amount: 1 },
  ),
  'Dragon Fodder': spell([], { kind: 'createToken', token: 'goblin-token', count: 2 }),
  'Seismic Rupture': spell([], {
    kind: 'damage',
    amount: 2,
    to: { each: 'creature', filter: { lacksKeyword: 'flying' } },
  }),
  'Fanatical Firebrand': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [anyTarget],
        effects: [{ kind: 'damage', amount: 1, to: t0 }],
      },
    ],
  },
  'Viashino Pyromancer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'damage', amount: 2, to: t0 }],
      },
    ],
  },
  'Heartfire Immolator': {
    abilities: [
      // Prowess
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: cost(0, 1), sacrificeSelf: true },
        targets: [creature],
        effects: [{ kind: 'damage', amount: { powerOf: 'self' }, to: t0 }],
      },
    ],
  },
  'Firebrand Archer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Searslicer Goblin': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'attackedThisTurn' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'goblin-token', count: 1 }],
      },
    ],
  },
  Guttersnipe: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: 'eachOpponent' }],
      },
    ],
  },
  'Giant Cindermaw': { abilities: [{ kind: 'static', effect: { kind: 'noLifeGain' } }] },
  'Spitfire Lagac': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Battlesong Berserker': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [yourCreature],
        effects: [{ kind: 'pump', to: t0, power: 1, toughness: 0, keywords: ['menace'] }],
      },
    ],
  },
  'Ravenous Giant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'controller' }],
      },
    ],
  },
  'Ball Lightning': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        targets: [],
        effects: [{ kind: 'sacrifice', what: 'self' }],
      },
    ],
  },
  'Gorehorn Raider': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'attackedThisTurn' },
        targets: [anyTarget],
        effects: [{ kind: 'damage', amount: 2, to: t0 }],
      },
    ],
  },
  'Dragon Trainer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'dragon-token', count: 1 }],
      },
    ],
  },
  'Shivan Dragon': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(0, 1) },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  },

  // -------------------------------------------------------------- green
  'Giant Growth': pump(3, 3),
  'Snakeskin Veil': spell(
    [yourCreature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['hexproof'] },
  ),
  'Bite Down': spell([yourCreature, theirCreature], {
    kind: 'damage',
    amount: { powerOf: t0 },
    from: t0,
    to: t1,
  }),
  // Printed: "artifact, enchantment, or creature with flying"; our pool has no artifacts/enchantments.
  'Broken Wings': spell([{ what: 'creature', filter: { hasKeyword: 'flying' } }], {
    kind: 'destroy',
    what: t0,
  }),
  'Felling Blow': spell(
    [yourCreature, theirCreature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'damage', amount: { powerOf: t0 }, from: t0, to: t1 },
  ),
  Overrun: spell([], {
    kind: 'pump',
    to: { each: 'creature', controller: 'you' },
    power: 3,
    toughness: 3,
    keywords: ['trample'],
  }),
  'Druid of the Cowl': { abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }] },
  "Dwynen's Elite": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'controlsAnother', subtype: 'Elf' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'elf-warrior-token', count: 1 }],
      },
    ],
  },
  'Imperious Perfect': {
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
      {
        kind: 'activated',
        cost: { mana: cost(0, 0, 1), tapSelf: true },
        targets: [],
        effects: [{ kind: 'createToken', token: 'elf-warrior-token', count: 1 }],
      },
    ],
  },
  'Beast-Kin Ranger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  },
  'Treetop Snarespinner': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(2, 0, 1) },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  'Gnarlback Rhino': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsSelf' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Wildheart Invoker': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(8) },
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 5, toughness: 5, keywords: ['trample'] }],
      },
    ],
  },
  'Elfsworn Giant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'elf-warrior-token', count: 1 }],
      },
    ],
  },
  "Heroes' Bane": {
    entersWithCounters: 4,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(2, 0, 2) },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: { powerOf: 'self' } }],
      },
    ],
  },
  'Rampaging Baloths': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'beast-token', count: 1 }],
      },
    ],
  },
  'Affectionate Indrik': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [theirCreature],
        effects: [{ kind: 'fight', a: 'self', b: t0 }],
      },
    ],
  },
  'Pelakka Wurm': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 7 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Aggressive Mammoth': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
    ],
  },
};

const token = (
  id: string,
  name: string,
  color: 'R' | 'G',
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: [color],
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities: [],
  isToken: true,
});

export const TOKENS: CardDefinition[] = [
  token('goblin-token', 'Goblin', 'R', ['Goblin'], 1, 1),
  token('dragon-token', 'Dragon', 'R', ['Dragon'], 4, 4, ['flying']),
  token('elf-warrior-token', 'Elf Warrior', 'G', ['Elf', 'Warrior'], 1, 1),
  token('beast-token', 'Beast', 'G', ['Beast'], 4, 4),
];
