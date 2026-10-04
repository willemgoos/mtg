import type { AbilityDef, Amount, CardDefinition, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  creature,
  draw,
  onEnter,
  spell,
  t0,
  t1,
  t2,
  theirCreature,
  yourCreature,
} from '../fin/helpers.ts';
import { becomesPrepared, increment, opus } from './helpers.ts';

/**
 * Secrets of Strixhaven (14b, group B): the remaining blue cards. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */

const FRACTAL = 'stx-fractal-token';
export const SOS_ELEMENTAL = 'sos-elemental-3-3-flying-token';

/** The 3/3 blue and red Elemental creature token with flying. */
export const SOS_BLUE_B_TOKENS: CardDefinition[] = [
  {
    id: SOS_ELEMENTAL,
    name: 'Elemental',
    manaCost: { generic: 0, colored: {} },
    colors: ['U', 'R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elemental'],
    power: 3,
    toughness: 3,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];

const upTo = (spec: TargetSpec): TargetSpec => ({ ...spec, optional: true });
const stun = (amount: Amount, to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount,
  to,
});
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const elemental: EffectDef = { kind: 'createToken', token: SOS_ELEMENTAL, count: 1 };
const fractalTokens = (count: Amount): EffectDef => ({
  kind: 'createToken',
  token: FRACTAL,
  count,
});
const instantOrSorcery: CardFilter = { types: ['Instant', 'Sorcery'] };
const flying = (to: Ref): EffectDef => ({
  kind: 'pump',
  to,
  power: 0,
  toughness: 0,
  keywords: ['flying'],
});
const pumpSelf = (power: number, toughness: number): EffectDef => ({
  kind: 'pump',
  to: 'self',
  power,
  toughness,
});
/** Opus with a target ("target player mills three cards"). */
const opusTargeted = (
  targets: TargetSpec[],
  small: EffectDef[],
  big: EffectDef[],
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
  targets,
  effects: [
    {
      kind: 'if',
      condition: { kind: 'amountAtLeast', amount: { manaSpentOnSubject: true }, min: 5 },
      then: big,
      else: small,
    },
  ],
});
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const loot = (n: number): EffectDef[] => [draw(n), { kind: 'discard', count: n }];

export const SOS_BLUE_B: Record<string, Behavior> = {
  // ------------------------------------------------------------ prepare cards
  'Campus Composer': { entersPrepared: true },
  'Emeritus of Ideation': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'graveyardCount', min: 8 },
            then: [
              {
                kind: 'may',
                effects: [custom('exileEightFromGraveyard'), { kind: 'prepare', what: 'self' }],
              },
            ],
          },
        ],
      },
    ],
  },
  'Encouraging Aviator': { abilities: [becomesPrepared({ on: 'attacks' })] },
  'Harmonized Trio': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, tapOtherCreatures: 2 },
        targets: [],
        effects: [{ kind: 'prepare', what: 'self' }],
        label: '{T}, Tap two untapped creatures you control: This creature becomes prepared',
      },
    ],
  },
  'Jadzi, Steward of Fate': {
    entersPrepared: true,
    abilities: [onEnter(...loot(2))],
  },
  'Landscape Painter': { entersPrepared: true },
  'Skycoach Conductor': { entersPrepared: true },
  'Spellbook Seeker': { entersPrepared: true },

  // ---------------------------------------------------------------- creatures
  'Deluge Virtuoso': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'tap', what: t0 }, stun(1, t0)],
      },
      opus([pumpSelf(1, 1)], [pumpSelf(2, 2)]),
    ],
  },
  'Exhibition Tidecaller': {
    abilities: [
      opusTargeted(
        [{ what: 'player' }],
        [{ kind: 'mill', count: 3, who: t0 }],
        [{ kind: 'mill', count: 10, who: t0 }],
      ),
    ],
  },
  // Simplified: the second ability is a stack ability that adds the mana (not a mana ability).
  'Hydro-Channeler': {
    abilities: [
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'U',
        onlyFor: 'InstantOrSorcery',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['W', 'U', 'B', 'R', 'G']], onlyFor: 'InstantOrSorcery' }],
        label: '{1}, {T}: Add one mana of any color (instant and sorcery spells only)',
      },
    ],
  },
  'Matterbending Mage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [upTo({ what: 'creature', filter: { other: true } })],
        effects: [{ kind: 'bounce', what: t0 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: { hasX: true } },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Muse Seeker': {
    abilities: [opus([draw(1), { kind: 'discard', count: 1 }], [draw(1)])],
  },
  'Orysa, Tide Choreographer': {
    costReductionIf: {
      condition: {
        kind: 'amountAtLeast',
        amount: { count: 'totalToughnessOfCreaturesYouControl' },
        min: 10,
      },
      amount: 3,
    },
    abilities: [onEnter(draw(2))],
  },
  'Pensive Professor': {
    abilities: [
      increment,
      {
        kind: 'triggered',
        trigger: { on: 'youPutCounters', self: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Tester of the Tangential': {
    abilities: [
      increment,
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'chooseCustom', handler: 'testerX' }],
      },
    ],
  },
  'Textbook Tabulator': { abilities: [increment, onEnter(surveil(2))] },

  // ------------------------------------------------------------------- spells
  'Banishing Betrayal': spell(
    [{ what: 'permanent', filter: { nonland: true } }],
    { kind: 'bounce', what: t0 },
    surveil(1),
  ),
  'Brush Off': {
    costReductionIfTarget: { filter: instantOrSorcery, amount: 1, alsoColored: 'U' },
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: t0 }] },
  },
  'Chase Inspiration': spell([yourCreature], {
    kind: 'pump',
    to: t0,
    power: 0,
    toughness: 3,
    keywords: ['hexproof'],
  }),
  // Simplified: at most three targets, however large X is.
  'Divergent Equation': {
    upToXTargets: true,
    afterResolving: 'exile',
    spell: {
      targets: [
        { what: 'graveyardCard', controller: 'you', filter: instantOrSorcery, optional: true },
        { what: 'graveyardCard', controller: 'you', filter: instantOrSorcery, optional: true },
        { what: 'graveyardCard', controller: 'you', filter: instantOrSorcery, optional: true },
      ],
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
        { kind: 'returnToHand', what: t2 },
      ],
    },
  },
  'Echocasting Symposium': {
    paradigm: true,
    spell: {
      targets: [{ what: 'player' }, yourCreature],
      effects: [{ kind: 'tokenCopy', of: t1, underTarget: 0 }],
    },
  },
  // Simplified: the cards not taken go to the bottom of your library at random, not in a chosen order.
  'Flow State': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: {
            kind: 'all',
            of: [
              { kind: 'graveyardCount', min: 1, types: ['Instant'] },
              { kind: 'graveyardCount', min: 1, types: ['Sorcery'] },
            ],
          },
          then: [{ kind: 'lookAndTake', count: 3, filter: {}, followUp: {} }],
          else: [{ kind: 'lookAndTake', count: 3, filter: {} }],
        },
      ],
    },
  },
  'Fractal Anomaly': spell([], {
    kind: 'createToken',
    token: FRACTAL,
    count: 1,
    counters: { count: 'cardsDrawnThisTurn' },
  }),
  // Simplified: only the base power and toughness change; it keeps its colours and creature types.
  Fractalize: spell([creature], {
    kind: 'pump',
    to: t0,
    power: { x: true, plus: 1 },
    toughness: { x: true, plus: 1 },
    setBase: true,
  }),
  Homesickness: spell(
    [{ what: 'player' }, upTo({ what: 'creature' }), upTo({ what: 'creature' })],
    { kind: 'draw', who: t0, amount: 2 },
    { kind: 'tap', what: t1 },
    stun(1, t1),
    { kind: 'tap', what: t2 },
    stun(1, t2),
  ),
  'Mana Sculpt': spell(
    [{ what: 'spell' }],
    custom('manaSculpt'),
    { kind: 'counter', what: t0 },
  ),
  Mathemagics: spell([{ what: 'player' }], custom('mathemagics')),
  "Muse's Encouragement": spell([], elemental, surveil(2)),
  Procrastinate: spell([creature], { kind: 'tap', what: t0 }, stun({ x: true, times: 2 }, t0)),
  'Run Behind': {
    costReductionIfTarget: { filter: { attacking: true }, amount: 1 },
    spell: {
      targets: [creature],
      effects: [{ kind: 'chooseCustom', handler: 'topOrBottom' }],
    },
  },
  'Wisdom of Ages': {
    afterResolving: 'exile',
    spell: { targets: [], effects: [custom('wisdomOfAges')] },
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const SOS_BLUE_B_BACKS: Record<string, Behavior> = {
  'Aqueous Aria (Campus Composer)': spell([], elemental),
  'Ancestral Recall (Emeritus of Ideation)': spell([{ what: 'player' }], {
    kind: 'draw',
    who: t0,
    amount: 3,
  }),
  'Jump (Encouraging Aviator)': spell([creature], flying(t0)),
  'Brainstorm (Harmonized Trio)': spell([], draw(3), {
    kind: 'chooseCustom',
    handler: 'putBackFromHand',
    params: { n: 2 },
  }),
  "Oracle's Gift (Jadzi, Steward of Fate)": spell(
    [],
    fractalTokens({ x: true }),
    {
      kind: 'counters',
      to: { each: 'creature', controller: 'you', filter: { subtype: 'Fractal' } },
      amount: { x: true },
    },
  ),
  'Vibrant Idea (Landscape Painter)': spell([], draw(2)),
  'All Aboard (Skycoach Conductor)': spell(
    [{ what: 'creature', controller: 'you', filter: { notSubtype: 'Pilot' } }],
    { kind: 'blink', what: t0 },
  ),
  'Careful Study (Spellbook Seeker)': spell([], ...loot(2)),
};
