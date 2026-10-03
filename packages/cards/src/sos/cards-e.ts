import type { Amount, CardFilter, EffectDef, Ref } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourCombat,
  creature,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
  yours,
} from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';
import { becomesPrepared, increment } from './helpers.ts';

/**
 * Secrets of Strixhaven (14b, group E): green and Quandrix (G/U). Fractals,
 * counters, converge, increment and the prepare creatures. Prepare spells are
 * the back faces, named "Spell (Creature)".
 */

const FRACTAL = 'stx-fractal-token';
/** A 0/0 green and blue Fractal creature token with this many +1/+1 counters. */
const fractal = (counters: Amount, count = 1): EffectDef => ({
  kind: 'createToken',
  token: FRACTAL,
  count,
  counters,
});
const stun = (to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount: 1,
  to,
});
const land: CardFilter = { types: ['Land'] };
const gainedLife = { kind: 'lifeThisTurn', who: 'you', gained: true } as const;
const basicToBattlefield: EffectDef = {
  kind: 'searchLibrary',
  filter: 'basicLand',
  to: 'battlefieldTapped',
};
const anyColourMana: EffectDef = {
  kind: 'addMana',
  mana: [['W', 'U', 'B', 'R', 'G']],
};

export const SOS_E: Record<string, Behavior> = {
  // ------------------------------------------------------------------- green
  'Aberrant Manawurm': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [pump('self', { manaSpentOnSubject: true }, 0)],
      },
    ],
  },
  'Additive Evolution': {
    abilities: [
      onEnter(fractal(3)),
      atYourCombat(
        [yourCreature],
        { kind: 'counters', to: t0, amount: 1 },
        pump(t0, 0, 0, ['vigilance']),
      ),
    ],
  },
  'Ambitious Augmenter': {
    abilities: [
      increment,
      when({ on: 'dies' }, [], {
        kind: 'if',
        condition: { kind: 'sourceHadCounters' },
        then: [fractal({ countersOn: 'self' })],
      }),
    ],
  },
  'Burrog Barrage': {
    spell: {
      targets: [yourCreature, { ...theirCreature, optional: true }],
      effects: [
        {
          kind: 'if',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'otherInstantsSorceriesCastThisTurn' },
            min: 1,
          },
          then: [pump(t0, 1, 0)],
        },
        { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
      ],
    },
  },
  'Chelonian Tackle': {
    spell: {
      targets: [yourCreature, { ...theirCreature, optional: true }],
      effects: [pump(t0, 0, 10), { kind: 'fight', a: t0, b: t1 }],
    },
  },
  'Comforting Counsel': {
    abilities: [
      when({ on: 'youGainLife' }, [], { kind: 'namedCounters', name: 'growth', amount: 1 }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          condition: { kind: 'sourceNamedCounters', name: 'growth', min: 5 },
          power: 3,
          toughness: 3,
        },
      },
    ],
  },
  'Emeritus of Abundance': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'controlsPermanents', filter: land, min: 8 },
        targets: [],
        effects: [{ kind: 'prepare', what: 'self' }],
      },
    ],
  },
  'Emil, Vastlands Roamer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}'), tapSelf: true },
        targets: [],
        effects: [fractal({ count: 'differentlyNamedLands' })],
        label: '{4}{G}, {T}: Create a Fractal with a counter per differently named land',
      },
    ],
  },
  'Environmental Scientist': {
    abilities: [onEnter({ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' })],
  },
  'Germination Practicum': {
    paradigm: true,
    spell: { targets: [], effects: [{ kind: 'counters', to: yours, amount: 2 }] },
  },
  'Glorious Decay': {
    modes: [
      {
        label: 'Destroy target artifact',
        targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        label: 'Glorious Decay deals 4 damage to target creature with flying',
        targets: [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        effects: [{ kind: 'damage', amount: 4, to: t0 }],
      },
      {
        label: 'Exile target card from a graveyard. Draw a card',
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'exileGraveyardCard', what: t0 }, draw(1)],
      },
    ],
  },
  'Hungry Graffalon': { abilities: [increment] },
  'Infirmary Healer': { entersPrepared: true },
  'Noxious Newt': { abilities: tapFor('G') },
  'Planar Engineering': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'sacrificeSeveral',
          count: 2,
          filter: land,
          then: [
            { ...basicToBattlefield, shuffle: false } as EffectDef,
            { ...basicToBattlefield, shuffle: false } as EffectDef,
            { ...basicToBattlefield, shuffle: false } as EffectDef,
            basicToBattlefield,
          ],
        },
      ],
    },
  },
  'Slumbering Trudge': { stunCountersMinusX: 3 },
  'Snarl Song': {
    spell: {
      targets: [],
      effects: [
        fractal({ colorsSpent: 'source' }, 2),
        { kind: 'gainLife', who: 'controller', amount: { colorsSpent: 'source' } },
      ],
    },
  },
  'Studious First-Year': { entersPrepared: true },
  'Tenured Concocter': {
    abilities: [
      when({ on: 'targetedByOpponent' }, [], { kind: 'may', effects: [draw(1)] }),
      {
        kind: 'static',
        effect: { kind: 'while', condition: gainedLife, power: 2, toughness: 0 },
      },
    ],
  },
  'Topiary Lecturer': {
    abilities: [
      increment,
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G', perPower: true },
    ],
  },
  'Vastlands Scavenger': { entersPrepared: true },
  'Wild Hypothesis': {
    spell: { targets: [], effects: [fractal({ x: true }), { kind: 'surveil', amount: 2 }] },
  },
  'Wildgrowth Archaic': {
    entersWithCountersPerColorSpent: true,
    abilities: [{ kind: 'static', effect: { kind: 'entersWithColorsSpentCounters' } }],
  },
  "Zimone's Experiment": {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'lookAndTake',
          count: 5,
          filter: { types: ['Creature', 'Land'] },
          followUp: { types: ['Creature', 'Land'] },
          landsTapped: true,
        },
      ],
    },
  },
  // ----------------------------------------------------------------- Quandrix
  'Applied Geometry': {
    spell: {
      targets: [{ what: 'permanent', controller: 'you', filter: { notSubtype: 'Aura' } }],
      effects: [{ kind: 'tokenCopy', of: t0, asFractal: 6 }],
    },
  },
  'Berta, Wise Extrapolator': {
    abilities: [
      increment,
      when({ on: 'youPutCounters', filter: { sameNameAsSource: true } }, [], anyColourMana),
      {
        kind: 'activated',
        cost: { mana: mana('{X}'), tapSelf: true },
        targets: [],
        effects: [fractal({ x: true })],
        label: '{X}, {T}: Create a Fractal with X +1/+1 counters',
      },
    ],
  },
  'Cuboid Colony': { abilities: [increment] },
  'Embrace the Paradox': {
    spell: {
      targets: [],
      effects: [
        draw(3),
        { kind: 'putFromHandOrGraveyard', filter: land, handOnly: true, tapped: true },
      ],
    },
  },
  'Fractal Mascot': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'tap', what: t0 }, stun(t0)],
      },
    ],
  },
  'Fractal Tender': {
    abilities: [
      increment,
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'sourceCounteredThisTurn' },
        targets: [],
        effects: [fractal(3)],
      },
    ],
  },
  "Geometer's Arthropod": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: { hasX: true } },
        targets: [],
        effects: [{ kind: 'lookAndTake', count: { xOfSubject: true }, filter: {} }],
      },
    ],
  },
  'Growth Curve': {
    spell: {
      targets: [yourCreature],
      effects: [
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'counters', to: t0, amount: { countersOn: t0 } },
      ],
    },
  },
  'Mind into Matter': {
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: { x: true } },
        {
          kind: 'putFromHandOrGraveyard',
          filter: { notTypes: ['Instant', 'Sorcery'] },
          handOnly: true,
          tapped: true,
          maxManaValueX: true,
        },
      ],
    },
  },
  'Paradox Surveyor': {
    abilities: [
      onEnter({
        kind: 'lookAndTake',
        count: 5,
        filter: { anyOf: [land, { hasX: true }] },
      }),
    ],
  },
  "Proctor's Gaze": {
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true }, optional: true }],
      effects: [{ kind: 'bounce', what: t0 }, basicToBattlefield],
    },
  },
  Pterafractyl: {
    entersWithXCounters: true,
    abilities: [onEnter(gain(2))],
  },
  'Quandrix Charm': {
    modes: [
      {
        label: 'Counter target spell unless its controller pays {2}',
        targets: [{ what: 'spell' }],
        effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{2}') }],
      },
      {
        label: 'Destroy target enchantment',
        targets: [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        label: 'Target creature has base power and toughness 5/5 until end of turn',
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 5, toughness: 5, setBase: true }],
      },
    ],
  },
  'Quandrix, the Proof': {
    abilities: [
      // Cascade.
      when({ on: 'castSelf' }, [], { kind: 'revealUntilCastable', max: 'belowSource' }),
      // Instant and sorcery spells you cast from your hand have cascade.
      when({ on: 'castSpell', filter: 'instantOrSorcery', fromHand: true }, [], {
        kind: 'revealUntilCastable',
        max: 'belowSubject',
      }),
    ],
  },
  'Tam, Observant Sequencer': {
    abilities: [becomesPrepared({ on: 'landfall' })],
  },
  'Dreamroot Cascade': {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: land, min: 2 },
    },
    abilities: tapFor('G', 'U'),
  },
  'Paradox Gardens': {
    entersTapped: true,
    abilities: [
      ...tapFor('G', 'U'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}{U}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
        label: '{2}{G}{U}, {T}: Surveil 1',
      },
    ],
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const SOS_E_BACKS: Record<string, Behavior> = {
  'Regrowth (Emeritus of Abundance)': {
    spell: {
      targets: [{ what: 'graveyardCard', controller: 'you' }],
      effects: [{ kind: 'returnToHand', what: t0 }],
    },
  },
  'Stream of Life (Infirmary Healer)': {
    spell: {
      targets: [{ what: 'player' }],
      effects: [{ kind: 'gainLife', who: t0, amount: { x: true } }],
    },
  },
  'Rampant Growth (Studious First-Year)': {
    spell: { targets: [], effects: [basicToBattlefield] },
  },
  'Bind to Life (Vastlands Scavenger)': {
    spell: {
      targets: [],
      effects: [
        { kind: 'millThenTake', count: 7, filter: { types: ['Creature'] }, to: 'battlefield' },
      ],
    },
  },
  'Deep Sight (Tam, Observant Sequencer)': {
    spell: { targets: [], effects: [draw(1), gain(1)] },
  },
};
