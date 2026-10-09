import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  anyColor,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  when,
  yourCreature,
  youControl,
} from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import {
  VIVID,
  entersWithMinusCounters,
  hasMinusCounter,
  returnBeheldWhenLeaves,
} from '../ecl-vocab.ts';
import { ECL_ELF, ECL_TREEFOLK } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): green. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_GREEN_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

/** The tapped Mutavault Mutable Explorer makes. */
const MUTAVAULT = 'ecl-green-mutavault-token';

const token = (id: string, extra: { count?: number | { count: 'cardsInGraveyard' } } = {}): EffectDef => ({
  kind: 'createToken',
  token: id,
  count: 1,
  ...extra,
});
const destroy: EffectDef = { kind: 'destroy', what: t0 };
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const PERMANENT_TYPES = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'] as const;
const yourGraveyardPermanent: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: [...PERMANENT_TYPES] },
};
const elfCardsInYourGraveyard = { count: 'cardsInGraveyard', subtype: 'Elf' } as const;

export const ECL_GREEN: Record<string, Behavior> = {
  // "Activate only as a sorcery."
  'Surly Farrier': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [pump(t0, 1, 1, ['vigilance'])],
      },
    ],
  },
  'Virulent Emissary': {
    abilities: [when({ on: 'otherCreatureEtb', controller: 'you' }, [], gain(1))],
  },
  // "For each color among permanents you control, add one mana of that color."
  'Bloom Tender': {
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G', vivid: true }],
  },
  'Unforgiving Aim': {
    modes: [
      mode('Destroy target creature with flying', [{ what: 'creature', filter: { hasKeyword: 'flying' } }], destroy),
      mode('Destroy target enchantment', [{ what: 'permanent', filter: { types: ['Enchantment'] } }], destroy),
      mode('Create a 2/2 black and green Elf creature token', [], token(ECL_ELF)),
    ],
  },
  'Wildvine Pummeler': { costReduction: VIVID },
  // "You may discard a card. If you do, search your library for a creature card."
  'Formidable Speaker': {
    abilities: [
      onEnter({
        kind: 'if',
        condition: { kind: 'handSize', min: 1 },
        then: [
          {
            kind: 'may',
            effects: [
              { kind: 'discard', count: 1 },
              { kind: 'searchLibrary', filter: { types: ['Creature'] }, to: 'hand', reveal: true },
            ],
          },
        ],
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [{ what: 'permanent', filter: { other: true } }],
        effects: [{ kind: 'untap', what: t0 }],
      },
    ],
  },
  // The two creatures are chosen as it resolves, one at a time (they aren't targets).
  'Spry and Mighty': {
    spell: { targets: [], effects: [{ kind: 'chooseCustom', handler: 'eclSpryPick', params: {} }] },
  },
  'Thoughtweft Charge': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        pump(t0, 3, 3),
        { kind: 'if', condition: { kind: 'creatureEnteredThisTurn' }, then: [draw(1)] },
      ],
    },
  },
  'Dundoolin Weaver': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'controlsCreature', filter: {}, count: 3 },
        targets: [yourGraveyardPermanent],
        effects: [{ kind: 'returnToHand', what: t0 }],
      },
    ],
  },
  'Selfless Safewright': {
    convoke: true,
    abilities: [onEnter({ kind: 'chooseCustom', handler: 'eclSafewrightType' })],
  },
  'Pitiless Fists': {
    enchant: { what: 'creature', controller: 'you' },
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent', optional: true }],
        {
          kind: 'if',
          condition: { kind: 'targetChosen', target: 0 },
          then: [{ kind: 'fight', a: 'attached', b: t0 }],
        },
      ),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 2 } },
    ],
  },
  'Champions of the Perfect': {
    beholdExile: { subtype: 'Elf' },
    abilities: [when({ on: 'castSpell', filter: 'creature' }, [], draw(1)), returnBeheldWhenLeaves],
  },
  'Sapling Nursery': {
    costReduction: { count: 'landsYouControl', subtype: 'Forest' },
    abilities: [
      when({ on: 'landfall' }, [], token(ECL_TREEFOLK)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}'), exileSelf: true },
        targets: [],
        effects: [
          pump(
            { each: 'permanent', controller: 'you', filter: { anyOf: [{ subtype: 'Treefolk' }, { subtype: 'Forest' }] } },
            0,
            0,
            ['indestructible'],
          ),
        ],
      },
    ],
  },
  'Bristlebane Outrider': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { maxPower: 2 } } },
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'creatureEnteredThisTurn', other: true },
          power: 2,
          toughness: 0,
        },
      },
    ],
  },
  'Blossoming Defense': {
    spell: { targets: [yourCreature], effects: [pump(t0, 2, 2, ['hexproof'])] },
  },
  'Luminollusk': { abilities: [onEnter(gain(VIVID))] },
  'Pummeler for Hire': {
    abilities: [onEnter(gain({ count: 'greatestPowerYouControl', subtype: 'Giant' }))],
  },
  'Celestial Reunion': {
    kicker: { cost: { generic: 0, colored: {} }, beholdChosenType: 2 },
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { types: ['Creature'], maxManaValue: 'x' },
          to: 'hand',
          battlefieldIfChosenType: true,
          reveal: true,
        },
      ],
    },
  },
  // Base 0/0, +1/+1 for each creature you control and each creature card in your graveyard.
  'Moon-Vigil Adherents': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { sum: [{ count: 'creaturesYouControl' }, { count: 'cardsInGraveyard', types: ['Creature'] }] },
          toughness: { sum: [{ count: 'creaturesYouControl' }, { count: 'cardsInGraveyard', types: ['Creature'] }] },
        },
      },
    ],
  },
  'Vinebred Brawler': {
    abilities: [
      { kind: 'static', effect: { kind: 'mustBeBlockedIfAble' } },
      when(
        { on: 'attacks' },
        [{ what: 'creature', controller: 'you', filter: { subtype: 'Elf', other: true } }],
        pump(t0, 2, 1),
      ),
    ],
  },
  // "Up to X target creatures you control", X = the colors among permanents you control.
  Prismabasher: {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'you', anyNumber: true, maxAmount: VIVID }],
        pump({ targetsFrom: 0 }, VIVID, VIVID),
      ),
    ],
  },
  'Assert Perfection': {
    spell: {
      targets: [yourCreature, { what: 'creature', controller: 'opponent', optional: true }],
      effects: [
        pump(t0, 1, 0),
        {
          kind: 'if',
          condition: { kind: 'targetChosen', target: 1 },
          then: [{ kind: 'damage', amount: { powerOf: t0 }, from: t0, to: { target: 1 } }],
        },
      ],
    },
  },
  'Crossroads Watcher': {
    abilities: [when({ on: 'otherCreatureEtb', controller: 'you' }, [], pump('self', 1, 0))],
  },
  'Bristlebane Battler': {
    ...entersWithMinusCounters(5),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        condition: hasMinusCounter,
        targets: [],
        effects: [{ kind: 'removeCounters', from: 'self', name: '-1/-1' }],
      },
    ],
  },
  "Gilt-Leaf's Embrace": {
    enchant: { what: 'creature' },
    abilities: [
      onEnter(pump('attached', 0, 0, ['trample', 'indestructible'])),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 0 } },
    ],
  },
  "Dawn's Light Archer": {},
  'Great Forest Druid': { abilities: anyColor() },
  'Mutable Explorer': {
    abilities: [onEnter({ kind: 'createToken', token: MUTAVAULT, count: 1, tapped: true })],
  },
  'Aurora Awakener': { abilities: [onEnter(custom('eclAuroraReveal'))] },
  'Lys Alana Dignitary': {
    beholdOrPay: { filter: { subtype: 'Elf' }, pay: mana('{2}') },
    abilities: [
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'G',
        amount: 2,
        condition: { kind: 'amountAtLeast', amount: elfCardsInYourGraveyard, min: 1 },
      },
    ],
  },
  "Morcant's Eyes": {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'surveil', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}{G}'), sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'createToken', token: ECL_ELF, count: elfCardsInYourGraveyard }],
      },
    ],
  },
  'Lys Alana Informant': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      when({ on: 'dies' }, [], { kind: 'surveil', amount: 1 }),
    ],
  },
  'Prismatic Undercurrents': {
    abilities: [
      onEnter({ kind: 'searchLibrary', filter: 'basicLand', to: 'hand', upTo: VIVID, reveal: true }),
      { kind: 'static', effect: { kind: 'extraLandDrop' } },
    ],
  },
  'Shimmerwilds Growth': {
    enchant: { what: 'permanent', filter: { types: ['Land'] } },
    abilities: [
      onEnter({ kind: 'chooseColor' }),
      { kind: 'static', effect: { kind: 'landIsChosenColor' } },
      { kind: 'static', effect: { kind: 'landBonusMana' } },
    ],
  },
  'Midnight Tilling': {
    spell: {
      targets: [],
      effects: [{ kind: 'millThenTake', count: 4, filter: { notTypes: ['Instant', 'Sorcery'] } }],
    },
  },
  'Mistmeadow Council': {
    costReduction: { if: youControl('Kithkin'), then: 1, else: 0 },
    abilities: [onEnter(draw(1))],
  },
  'Chomping Changeling': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'permanent',
            optional: true,
            filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }] },
          },
        ],
        destroy,
      ),
    ],
  },
  'Safewright Cavalry': {
    abilities: [
      { kind: 'static', effect: { kind: 'maxBlockers', count: 1 } },
      {
        kind: 'activated',
        cost: { mana: mana('{5}') },
        targets: [{ what: 'creature', controller: 'you', filter: { subtype: 'Elf' } }],
        effects: [pump(t0, 2, 2)],
      },
    ],
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_GREEN_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_GREEN_TOKENS: CardDefinition[] = [
  // Mutable Explorer: "a tapped Mutavault token. It's a land with '{T}: Add {C}' and '{1}: This token becomes a 2/2 creature
  // with all creature types until end of turn. It's still a land.'"
  {
    id: MUTAVAULT,
    name: 'Mutavault',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    supertypes: [],
    types: ['Land'],
    subtypes: [],
    keywords: [],
    isToken: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: 0,
            toughness: 0,
            basePT: [2, 2],
            becomesCreature: true,
            creatureOnly: true,
          },
          { kind: 'allCreatureTypes', what: 'self', duration: 'endOfTurn' },
        ],
        label: '{1}: This token becomes a 2/2 creature with all creature types until end of turn. It\'s still a land.',
      },
    ] satisfies AbilityDef[],
  },
];
