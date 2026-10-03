import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardFilter,
  EffectDef,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  gain,
  mana,
  onEnter,
  t0,
  t1,
  theirCreature,
  yourCreature,
} from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';

/**
 * Strixhaven (13a): the Quandrix Equation deck (G/U) and its Lessons
 * (docs/strixhaven-13a-decks.md, deck 2).
 */

const FRACTAL = 'stx-fractal-token';
const PEST = 'stx-pest-token';
const ELEMENTAL = 'stx-elemental-ur-token';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  power: number,
  toughness: number,
  abilities: AbilityDef[] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords: [],
  abilities,
  isToken: true,
});

export const QUANDRIX_TOKENS: CardDefinition[] = [
  token(FRACTAL, 'Fractal', ['G', 'U'], ['Fractal'], 0, 0),
  token(PEST, 'Pest', ['B', 'G'], ['Pest'], 1, 1, [
    { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [gain(1)] },
  ]),
  token(ELEMENTAL, 'Elemental', ['U', 'R'], ['Elemental'], 4, 4),
];

/** "Magecraft: whenever you cast or copy an instant or sorcery spell, ...". */
const magecraft = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets,
  effects,
});

const counters = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });

/** A 0/0 Fractal that gets N +1/+1 counters (an Amount: X, lands, ...). */
const fractal = (counts: Amount): EffectDef => ({
  kind: 'createToken',
  token: FRACTAL,
  count: 1,
  counters: counts,
});
const stun = (to: Ref): EffectDef => ({ kind: 'namedCounters', name: 'stun', amount: 1, to });
const learn: EffectDef = { kind: 'learn' };
const pump = (
  to: Ref,
  power: number,
  toughness: number,
  keywords: ('reach' | 'vigilance')[] = [],
) =>
  ({ kind: 'pump', to, power, toughness, ...(keywords.length ? { keywords } : {}) }) as EffectDef;
const basicLand = (type: string) => ({ subtype: type, supertypes: ['Basic'] as ['Basic'] });
const land: CardFilter = { types: ['Land'] };

/** The six pairs of Quandrix Command's four modes ("choose two"), as one mode each. */
const commandModes = (() => {
  const bounceTarget: TargetSpec = {
    what: 'permanent',
    filter: { types: ['Creature', 'Planeswalker'] },
  };
  const counterTarget: TargetSpec = {
    what: 'spell',
    filter: { types: ['Artifact', 'Enchantment'] },
  };
  const counterCreature: TargetSpec = { what: 'creature' };
  const shuffleTarget: TargetSpec = { what: 'graveyardCard', controller: 'you', optional: true };
  type Part = { label: string; targets: TargetSpec[]; effects: (at: number) => EffectDef[] };
  const parts: Part[] = [
    {
      label: 'Return target creature or planeswalker to its owner’s hand',
      targets: [bounceTarget],
      effects: (at) => [{ kind: 'bounce', what: { target: at } }],
    },
    {
      label: 'Counter target artifact or enchantment spell',
      targets: [counterTarget],
      effects: (at) => [{ kind: 'counter', what: { target: at } }],
    },
    {
      label: 'Put two +1/+1 counters on target creature',
      targets: [counterCreature],
      effects: (at) => [counters({ target: at }, 2)],
    },
    {
      label: 'Shuffle up to three target cards from your graveyard into your library',
      targets: [shuffleTarget, shuffleTarget, shuffleTarget],
      effects: (at) =>
        [0, 1, 2].map((i): EffectDef => ({
          kind: 'putInLibrary',
          what: { target: at + i },
          position: 'top',
          shuffle: true,
        })),
    },
  ];
  const modes = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!;
      const b = parts[j]!;
      modes.push({
        label: `${a.label}; ${b.label.charAt(0).toLowerCase()}${b.label.slice(1)}`,
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects(0), ...b.effects(a.targets.length)],
      });
    }
  return modes;
})();

export const QUANDRIX: Record<string, Behavior> = {
  Biomathematician: {
    abilities: [
      onEnter(
        { kind: 'createToken', token: FRACTAL, count: 1 },
        counters({ each: 'creature', controller: 'you', filter: { subtype: 'Fractal' } }),
      ),
    ],
  },
  'Quandrix Pledgemage': { abilities: [magecraft([], counters('self'))] },
  'Quandrix Apprentice': {
    abilities: [magecraft([], { kind: 'lookAndTake', count: 3, filter: land })],
  },
  'Needlethorn Drake': {},
  'Frost Trickster': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'tap', what: t0 }, stun(t0)],
      },
    ],
  },
  'Waterfall Aerialist': {},
  'Karok Wrangler': { abilities: [magecraft([yourCreature], counters(t0))] },
  'Quandrix Cultivator': {
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: { anyOf: [basicLand('Forest'), basicLand('Island')] },
        to: 'battlefield',
      }),
    ],
  },
  'Zimone, Quandrix Prodigy': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'putFromHandOrGraveyard', filter: land, handOnly: true, tapped: true }],
        label: '{1}, {T}: Put a land from your hand onto the battlefield tapped',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'amountAtLeast', amount: { count: 'landsYouControl' }, min: 8 },
            then: [draw(2)],
            else: [draw(1)],
          },
        ],
        label: '{4}, {T}: Draw a card (two with eight or more lands)',
      },
    ],
  },
  'Professor of Zoomancy': {
    abilities: [onEnter({ kind: 'createToken', token: PEST, count: 1 })],
  },
  'Springmane Cervin': { abilities: [onEnter(gain(2))] },
  'Overgrown Arch': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [gain(1)],
        label: '{T}: You gain 1 life',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificeSelf: true },
        targets: [],
        effects: [learn],
        label: '{2}, Sacrifice: Learn',
      },
    ],
  },
  'Archmage Emeritus': { abilities: [magecraft([], draw(1))] },
  'Leyline Invocation': {
    spell: { targets: [], effects: [fractal({ count: 'landsYouControl' })] },
  },
  'Serpentine Curve': {
    spell: {
      targets: [],
      effects: [fractal({ sum: [1, { count: 'instantsSorceriesInExileAndGraveyard' }] })],
    },
  },
  'Field Trip': {
    spell: {
      targets: [],
      effects: [
        { kind: 'searchLibrary', filter: basicLand('Forest'), to: 'battlefieldTapped' },
        learn,
      ],
    },
  },
  'Pop Quiz': { spell: { targets: [], effects: [draw(1), learn] } },
  'Big Play': {
    spell: {
      targets: [creature],
      effects: [pump(t0, 2, 2, ['reach']), counters(t0)],
    },
  },
  'Quandrix Command': { modes: commandModes },
  'Eureka Moment': {
    spell: {
      targets: [],
      effects: [draw(2), { kind: 'putFromHandOrGraveyard', filter: land, handOnly: true }],
    },
  },
  'Mage Duel': {
    costReductionIf: { condition: { kind: 'castInstantOrSorceryThisTurn' }, amount: 2 },
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [pump(t0, 1, 2), { kind: 'fight', a: t0, b: t1 }],
    },
  },
  'Decisive Denial': {
    modes: [
      {
        label: 'Fight',
        targets: [yourCreature, theirCreature],
        effects: [{ kind: 'fight', a: t0, b: t1 }],
      },
      {
        label: 'Counter target noncreature spell unless its controller pays {3}',
        targets: [{ what: 'spell', filter: { notTypes: ['Creature'] } }],
        effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{3}') }],
      },
    ],
  },
  'Devouring Tendrils': {
    spell: {
      targets: [
        yourCreature,
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'] },
        },
      ],
      effects: [
        { kind: 'damage', amount: { powerOf: t0 }, from: t0, to: t1 },
        { kind: 'whenDiesThisTurn', what: t1, effects: [gain(2)] },
      ],
    },
  },
  'Divide by Zero': {
    modes: [
      {
        label: 'Return target spell with mana value 1 or greater to its owner’s hand',
        targets: [{ what: 'spell', filter: { minManaValue: 1 } }],
        effects: [{ kind: 'returnSpellToHand', what: t0 }, learn],
      },
      {
        label: 'Return target permanent with mana value 1 or greater to its owner’s hand',
        targets: [{ what: 'permanent', filter: { minManaValue: 1 } }],
        effects: [{ kind: 'bounce', what: t0 }, learn],
      },
    ],
  },
  Resculpt: {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'createToken', token: ELEMENTAL, count: 1, forControllerOf: 0 },
      ],
    },
  },
  'Arcane Subtraction': {
    spell: { targets: [creature], effects: [pump(t0, -4, 0), learn] },
  },
  Curate: { spell: { targets: [], effects: [{ kind: 'surveil', amount: 2 }, draw(1)] } },
  'Bury in Books': {
    costReductionIfTarget: { filter: { attacking: true }, amount: 2 },
    spell: {
      targets: [creature],
      effects: [{ kind: 'putInLibrary', what: t0, position: 'second' }],
    },
  },
  Reject: {
    spell: {
      targets: [{ what: 'spell', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{3}'), exile: true }],
    },
  },
  'Quandrix Campus': {
    entersTapped: true,
    abilities: [
      ...tapFor('G', 'U'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
        label: '{4}, {T}: Scry 1',
      },
    ],
  },
  // Lessons (the deck's sideboard, fetched by Learn).
  'Fractal Summoning': {
    spell: { targets: [], effects: [fractal({ x: true })] },
  },
  // Introduction to Prophecy and Expanded Anatomy: shared with Lorehold (lorehold.ts).
  'Environmental Sciences': {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }, gain(2)],
    },
  },
};
