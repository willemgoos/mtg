import type { AbilityDef, CardDefinition, EffectDef, Keyword, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { atYourEndStep, creature, draw, gain, onEnter, pump, t0, when } from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';
import { equip } from '../msc/helpers.ts';
import { FRA_HEARTWOOD } from './tokens.ts';

/**
 * Reality Fracture (17a): green. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_GREEN_BACKS. See docs/reality-fracture-plan.md.
 */

const BEAST = 'fra-green-beast-token';
const MOWU = 'fra-green-mowu-token';
const FOREST_TENTACLE = 'fra-green-forest-tentacle-token';

const token = (id: string, count = 1): EffectDef => ({ kind: 'createToken', token: id, count });
const putCounters = (to: 'self' | { target: number }, amount: number): EffectDef => ({
  kind: 'counters',
  to,
  amount,
});

const yourGraveyardLand: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Land'] },
};
const PERMANENT_TYPES = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'] as const;

/** "Choose one of these keywords" (a choice made as the effect resolves). */
const chooseKeyword = (...keywords: Keyword[]): EffectDef => ({
  kind: 'choose',
  options: keywords.map((k) => ({
    label: k[0]!.toUpperCase() + k.slice(1),
    effects: [pump('subject', 0, 0, [k])],
  })),
});

/** "Basic landcycling {2}". */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

export const FRA_GREEN: Record<string, Behavior> = {
  'Bestial Incursion': {
    spell: { targets: [], effects: [token(BEAST)] },
    flashback: mana('{5}{G}'),
  },
  // "If that permanent was a legendary enchantment, draw a card" is checked before it is destroyed
  // (it is a fact about what the permanent was, and drawing doesn't depend on the destruction).
  'Budding Insurgent': {
    abilities: [
      {
        kind: 'activated',
        cost: { sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [
          {
            what: 'permanent',
            filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }] },
          },
        ],
        effects: [
          {
            kind: 'if',
            condition: {
              kind: 'targetMatches',
              target: 0,
              filter: { types: ['Enchantment'], supertypes: ['Legendary'] },
            },
            then: [draw(1)],
          },
          { kind: 'destroy', what: t0 },
        ],
      },
    ],
  },
  'Carnivorous Cultivator': {
    entersPrepared: true,
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [yourGraveyardLand], {
        kind: 'returnToHand',
        what: t0,
      }),
    ],
  },
  'Edgar, Moonlit Sovereign': {
    abilities: [
      atYourEndStep(
        { kind: 'not', condition: { kind: 'youCastSpellThisTurn' } },
        [],
        putCounters('self', 2),
      ),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}') },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: { each: 'creature', controller: 'you', filter: { minPlusOneCounters: 1 } },
            amount: 1,
          },
        ],
      },
    ],
  },
  'Fblthp, Knows the Way': {
    powerEquals: { count: 'basicLandTypesYouControl' },
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: 'basicLand',
        to: 'hand',
        upTo: { x: true },
        differentNames: true,
      }),
    ],
  },
  'Flourishing Grapple': {
    spell: {
      targets: [
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'], colors: ['R', 'W'] },
        },
        { what: 'creature', controller: 'you' },
      ],
      effects: [
        { kind: 'loseAbilities', what: t0, untilEndOfTurn: true },
        { kind: 'damage', amount: { powerOf: { target: 1 } }, from: { target: 1 }, to: t0 },
      ],
    },
  },
  Gardenize: {
    abilities: [
      when({ on: 'creatureYouControlDies' }, [], {
        kind: 'namedCounters',
        name: 'charge',
        amount: 1,
      }),
      when({ on: 'beginningOfMain', which: 1 }, [], {
        kind: 'addMana',
        mana: [['G']],
        count: { namedCountersOnSource: 'charge' },
      }),
    ],
  },
  'Ghalta the Unstoppable': {
    costReduction: { count: 'greatestPowerYouControl' },
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
  'Greenhouse Propagator': {
    abilities: [when({ on: 'otherCreatureEtb', controller: 'you' }, [], gain(1)), ...tapFor('G')],
  },
  'Heartwood Crafter': {
    entersPrepared: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C', notForSpellsFromHand: true },
    ],
  },
  'Hexhaven Invigorator': {
    abilities: [
      when({ on: 'dealtDamage' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'searchLibrary',
            filter: { types: ['Land'] },
            to: 'battlefieldTapped',
            upTo: { event: 'amount' },
          },
        ],
      }),
    ],
  },
  'Hungering Puppetbeast': {
    abilities: [
      onEnter(token(FRA_HEARTWOOD)),
      {
        kind: 'activated',
        cost: {
          mana: mana('{1}'),
          sacrificePermanent: { types: ['Artifact'], other: true },
        },
        targets: [],
        effects: [
          putCounters('self', 1),
          {
            kind: 'choose',
            options: (['trample', 'hexproof', 'haste'] as const).map((k) => ({
              label: k[0]!.toUpperCase() + k.slice(1),
              effects: [pump('self', 0, 0, [k])],
            })),
          },
        ],
      },
    ],
  },
  "Hunter's Axe": {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 0 } },
      when({ on: 'equippedAttacks', creatureAbility: true }, [], chooseKeyword('trample', 'deathtouch')),
      equip('{2}'),
    ],
  },
  'Jiang Yanggu, Never Alone': {
    abilities: [
      onEnter(token(MOWU)),
      atYourEndStep(undefined, [], {
        kind: 'untap',
        what: { each: 'permanent', controller: 'you', filter: { token: true } },
      }),
    ],
  },
  // "{T}: Choose a color. Add one mana of that color for each different power among creatures you control."
  // A mana ability: the colour is chosen as the mana is spent (Reality Fracture (17a fixes)).
  'Loot, the Nexus': {
    abilities: [
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'G',
        anyOneColor: true,
        amountOf: { count: 'differentPowersYouControl' },
      },
    ],
  },
  'Marwyn, the Preserver': {
    abilities: [
      { kind: 'static', effect: { kind: 'landsHexproof' } },
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [yourGraveyardLand],
        effects: [{ kind: 'returnToHand', what: t0 }],
      },
    ],
  },
  Omnipresence: {
    abilities: [{ kind: 'static', effect: { kind: 'freeCastByCreatureCount' } }],
  },
  'Pia, Aether Ascetic': {
    abilities: [
      onEnter({
        kind: 'if',
        condition: { kind: 'handSize', min: 1 },
        then: [
          {
            kind: 'may',
            effects: [
              { kind: 'discard', count: 1 },
              { kind: 'searchLibrary', filter: { types: ['Enchantment'] }, to: 'hand' },
            ],
          },
        ],
      }),
    ],
  },
  'Puppet Crafting': {
    enchant: {
      what: 'permanent',
      filter: {
        anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'], notSubtype: 'Aura' }],
      },
    },
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          basePT: [5, 5],
          addSubtypes: ['Construct'],
          becomesCreature: true,
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}') },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Restore with Empathy': {
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: [...PERMANENT_TYPES] },
        },
      ],
      effects: [{ kind: 'returnToHand', what: t0 }, gain(4)],
    },
  },
  'Ruric Thar, Magecrusher': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'not', condition: { kind: 'sourceDealtCombatDamage' } },
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
    ],
  },
  'Simulacrum Shaper': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      }),
      when({ on: 'dies' }, [], draw(1)),
    ],
  },
  'Something Worth Saving': {
    spell: {
      targets: [],
      effects: [
        { kind: 'millThenTake', count: 4, filter: { notTypes: ['Instant', 'Sorcery'] } },
        gain(1),
      ],
    },
  },
  'Sureshot Sower': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}'), discardSelf: true },
        fromHand: true,
        targets: [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  // Power and toughness are both the number of card types; the +1 is a static boost.
  Tarmogoyf: {
    ptEquals: { count: 'cardTypesInGraveyards' },
    abilities: [{ kind: 'static', effect: { kind: 'boost', power: 0, toughness: 1 } }],
  },
  "Tethermage's Advantage": {
    spell: {
      targets: [creature],
      effects: [pump(t0, 2, 2, ['reach']), { kind: 'untap', what: t0 }],
    },
  },
  'Titanbones, Towering Heart': {
    abilities: [
      when({ on: 'youGainLife' }, [], putCounters('self', 2)),
      {
        kind: 'triggered',
        trigger: { on: 'selfDiscarded' },
        fromGraveyard: true,
        targets: [],
        effects: [gain(3)],
      },
    ],
  },
  'Verdant Kraken': {
    abilities: [when({ on: 'beginningOfUpkeep', whose: 'each' }, [], token(FOREST_TENTACLE))],
  },
  'Vinelasher Adept': {
    abilities: [when({ on: 'etb' }, [creature], putCounters(t0, 3)), basicLandcycling('{2}')],
  },
  'Wrecking Gecko': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{6}{G}{G}') },
        targets: [],
        effects: [pump('self', 4, 4, ['trample'])],
      },
    ],
  },
  'Yoshimaru, Scrappy Stray': {
    abilities: [
      when(
        { on: 'etb' },
        [
          { what: 'creature', controller: 'you', filter: { other: true } },
          { what: 'creature', controller: 'opponent', optional: true },
        ],
        {
          kind: 'if',
          condition: { kind: 'targetChosen', target: 1 },
          then: [{ kind: 'fight', a: t0, b: { target: 1 } }],
        },
      ),
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        targets: [{ what: 'creature', filter: { nonlegendary: true } }],
        effects: [putCounters(t0, 1)],
      },
    ],
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_GREEN_BACKS: Record<string, Behavior> = {
  'Enroot (Carnivorous Cultivator)': {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'graveyard' }],
    },
  },
  'Soul Tether (Heartwood Crafter)': {
    spell: { targets: [], effects: [token(FRA_HEARTWOOD)] },
  },
};

const tokenBase = {
  manaCost: { generic: 0, colored: {} },
  colors: ['G'],
  supertypes: [],
  keywords: [],
  abilities: [],
  isToken: true,
} as const satisfies Partial<CardDefinition>;

/** Tokens only this group's cards make. */
export const FRA_GREEN_TOKENS: CardDefinition[] = [
  // "A 4/4 green Beast creature token with trample."
  {
    ...tokenBase,
    id: BEAST,
    name: 'Beast',
    colors: ['G'],
    types: ['Creature'],
    subtypes: ['Beast'],
    power: 4,
    toughness: 4,
    keywords: ['trample'],
  },
  // "Mowu, a legendary 3/3 green Dog creature token."
  {
    ...tokenBase,
    id: MOWU,
    name: 'Mowu',
    colors: ['G'],
    supertypes: ['Legendary'],
    types: ['Creature'],
    subtypes: ['Dog'],
    power: 3,
    toughness: 3,
  },
  // "A 3/3 green Forest Tentacle land creature token" ("{T}: Add {G}." as a Forest).
  {
    ...tokenBase,
    id: FOREST_TENTACLE,
    name: 'Forest Tentacle',
    colors: ['G'],
    types: ['Land', 'Creature'],
    subtypes: ['Forest', 'Tentacle'],
    power: 3,
    toughness: 3,
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }],
  },
];
