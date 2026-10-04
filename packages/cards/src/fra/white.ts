import type { AbilityDef, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  atYourCombat,
  atYourEndStep,
  creature,
  draw,
  gain,
  t0,
  t1,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { FRA_CADET } from './tokens.ts';

/**
 * Reality Fracture (17a): white. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_WHITE_BACKS. See docs/reality-fracture-plan.md.
 */

/** The 1/1 colorless Thopter artifact creature token with flying (Saheeli, Consul of Oversight). */
export const FRA_WHITE_THOPTER = 'fra-white-thopter-token';

/** "Target creature or planeswalker" with more restrictions. */
const creatureOrWalker = (filter: CardFilter = {}): TargetSpec => ({
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'], ...filter },
});
const anyColor = (['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
  kind: 'mana',
  cost: { tapSelf: true },
  produces,
  // "Spend this mana only to cast a planeswalker spell."
  onlyFor: 'Planeswalker',
}));
const surveil1: EffectDef = { kind: 'surveil', amount: 1 };
const yourCreaturesEach = { each: 'creature', controller: 'you' } as const;

export const FRA_WHITE: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Blossom-Blessed Angel': { entersPrepared: true },
  'Danitha, Sword of Hope': {
    abilities: [
      // "Whenever you cast an Equipment spell or a spell that targets a creature you control, draw a card.
      // This ability triggers only once each turn."
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'equipmentOrTargetsYourCreature' },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Enlightened Confidant': {
    abilities: [
      // "At the beginning of your end step, if you gained life this turn, surveil 1. If you put a card with mana
      // value less than or equal to the amount of life you gained this turn into your graveyard this way, put that
      // card into your hand."
      atYourEndStep({ kind: 'lifeThisTurn', who: 'you', gained: true }, [], {
        kind: 'surveil',
        amount: 1,
        graveyardToHand: { maxManaValue: { count: 'lifeGainedThisTurn' } },
      }),
    ],
  },
  'Fateshaper Aspirant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Return target legendary card from your graveyard to your hand',
            targets: [
              {
                what: 'graveyardCard',
                controller: 'you',
                filter: { supertypes: ['Legendary'] },
              },
            ],
            effects: [{ kind: 'returnToHand', what: t0 }],
          },
          {
            label:
              'Put a +1/+1 counter on target creature. It gains vigilance and indestructible until end of turn',
            targets: [creature],
            effects: [
              { kind: 'counters', to: t0, amount: 1 },
              {
                kind: 'pump',
                to: t0,
                power: 0,
                toughness: 0,
                keywords: ['vigilance', 'indestructible'],
              },
            ],
          },
        ],
      },
    ],
  },
  'Flickering Hound': {
    abilities: [
      // "Whenever you cast a creature spell, exile up to one other target creature you control, then return that
      // card to the battlefield under its owner's control."
      when(
        { on: 'castSpell', filter: 'creature' },
        [{ ...yourCreature, filter: { other: true }, optional: true }],
        { kind: 'blink', what: t0 },
      ),
    ],
  },
  'Graft Surgeon': {
    // "This creature enters with a +1/+1 counter on it."
    entersWithCounters: 1,
    abilities: [
      // "When this creature dies, put its counters on up to one target creature you control."
      when({ on: 'dies' }, [{ ...yourCreature, optional: true }], {
        kind: 'custom',
        handler: 'putSourceCountersOnTarget',
      }),
    ],
  },
  'Ghalta the Immovable': {
    // "This spell costs {X} less to cast, where X is the greatest toughness among creatures you control."
    costReduction: { count: 'greatestToughnessYouControl' },
    abilities: [
      { kind: 'static', effect: { kind: 'creaturesIgnoreDefender' } },
      { kind: 'static', effect: { kind: 'toughnessAssignsCombatDamage' } },
    ],
  },
  'Guiding Hydra': {
    // "This creature enters with X +1/+1 counters on it."
    entersWithXCounters: true,
    abilities: [
      // "At the beginning of combat on your turn, you may remove a +1/+1 counter from this creature. If you do,
      // put a +1/+1 counter on each other creature you control."
      atYourCombat([], {
        kind: 'if',
        condition: { kind: 'sourceCounters', min: 1 },
        then: [
          {
            kind: 'may',
            effects: [
              { kind: 'custom', handler: 'removeSelfCounters', params: { n: 1 } },
              {
                kind: 'counters',
                to: { each: 'creature', controller: 'you', filter: { other: true } },
                amount: 1,
              },
            ],
          },
        ],
      }),
    ],
  },
  'Koth of the Homestead': {
    abilities: [
      // "Landfall — Whenever a land you control enters, you gain 1 life."
      when({ on: 'landfall' }, [], gain(1)),
      // "Whenever a Plains you control enters, put a +1/+1 counter on target creature."
      when({ on: 'otherPermanentEtb', filter: { subtype: 'Plains' } }, [creature], {
        kind: 'counters',
        to: t0,
        amount: 1,
      }),
    ],
  },
  'Liliana the Faultless': {
    abilities: [
      // "Whenever another creature or planeswalker you control enters, you gain 1 life."
      when(
        { on: 'otherPermanentEtb', filter: { types: ['Creature', 'Planeswalker'] } },
        [],
        gain(1),
      ),
      // "{1}, {T}, Discard a card: Another target creature or planeswalker you control gains hexproof until end of turn."
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, discard: true },
        targets: [
          {
            what: 'permanent',
            controller: 'you',
            filter: { types: ['Creature', 'Planeswalker'], other: true },
          },
        ],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['hexproof'] }],
      },
    ],
  },
  'Lyra, Archangel of Dawn': {
    abilities: [
      // "Whenever you gain life, put a +1/+1 counter on each Angel you control."
      when({ on: 'youGainLife' }, [], {
        kind: 'counters',
        to: { each: 'creature', controller: 'you', filter: { subtype: 'Angel' } },
        amount: 1,
      }),
    ],
  },
  'Rescue Girl, First Responder': {
    abilities: [
      // "{T}: Return another target permanent you control to its owner's hand. Activate only during your turn."
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'yourTurn' },
        targets: [{ what: 'permanent', controller: 'you', filter: { other: true } }],
        effects: [{ kind: 'bounce', what: t0 }],
      },
    ],
  },
  'Saheeli, Consul of Oversight': {
    abilities: [
      // "Whenever you scry or surveil, create a 1/1 colorless Thopter artifact creature token with flying. This
      // ability triggers only once each turn."
      {
        ...when({ on: 'youScryOrSurveil' }, [], {
          kind: 'createToken',
          token: FRA_WHITE_THOPTER,
          count: 1,
        }),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'Shatterwing Pegasus': {
    abilities: [
      // "{4}{W}: Creatures you control get +1/+1 until end of turn."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}') },
        targets: [],
        effects: [{ kind: 'pump', to: yourCreaturesEach, power: 1, toughness: 1 }],
      },
    ],
  },
  'Thalia, the Survivor': {
    abilities: [
      // "Noncreature spells your opponents cast cost {1} more to cast."
      {
        kind: 'static',
        effect: { kind: 'opponentSpellsCostMore', filter: { notTypes: ['Creature'] }, amount: 1 },
      },
    ],
  },
  'Unflinching Hortimancer': {
    abilities: [
      // Ward {1} comes from its printed text. "Whenever you gain life, put a +1/+1 counter on this creature."
      when({ on: 'youGainLife' }, [], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },
  'Yoshimaru, Beloved Companion': {
    abilities: [
      // "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters
      // are put on it instead."
      { kind: 'static', effect: { kind: 'extraCounters', amount: 1, creaturesOnly: true } },
      // "{6}: Put a +1/+1 counter on target legendary creature."
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        targets: [{ what: 'creature', filter: { supertypes: ['Legendary'] } }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  'Yuriko, Blade of the Mighty': {
    abilities: [
      // "During combat, players can't cast spells or activate abilities that aren't mana abilities."
      { kind: 'static', effect: { kind: 'noCastOrActivateInCombat' } },
      // "Whenever a creature you control attacks a player alone, it gains double strike until end of turn."
      when({ on: 'creatureYouControlAttacks', alone: true, aPlayer: true }, [], {
        kind: 'pump',
        to: 'subject',
        power: 0,
        toughness: 0,
        keywords: ['doubleStrike'],
      }),
    ],
  },

  // ------------------------------------------------------------ noncreature permanents
  "Gideon's Memorial": {
    abilities: [
      // "Creature tokens you control get +1/+0 and have vigilance."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { token: true },
          power: 1,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
      // "{T}: Add one mana of any color. Spend this mana only to cast a planeswalker spell."
      ...anyColor,
      // "{1}{W}, Discard this card: It deals 4 damage to target attacking or blocking creature."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), discardSelf: true },
        fromHand: true,
        targets: [{ what: 'creature', filter: { attackingOrBlocking: true } }],
        effects: [{ kind: 'damage', amount: 4, to: t0 }],
        label: 'Discard: 4 damage to an attacking or blocking creature',
      },
    ],
  },
  'Memory Trap': {
    abilities: [
      // "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment
      // leaves the battlefield."
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
    ],
  },

  // ------------------------------------------------------------ instants and sorceries
  'Generous Revival': {
    flashback: mana('{4}{W}'),
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Creature'], maxManaValue: 3 },
        },
      ],
      // "...to the battlefield with an additional +1/+1 counter on it."
      effects: [{ kind: 'returnToBattlefield', what: t0, countersIf: { filter: {}, count: 1 } }],
    },
  },
  'Germinate Recruits': {
    spell: {
      targets: [],
      // "Create X 2/2 colorless Wizard Soldier creature tokens named Cadet, where X is the amount of life you
      // gained this turn."
      effects: [{ kind: 'createToken', token: FRA_CADET, count: { count: 'lifeGainedThisTurn' } }],
    },
  },
  'Kindred Judgment': {
    spell: {
      targets: [],
      // "Choose a creature type. Destroy all creatures that aren't of the chosen type."
      effects: [
        { kind: 'chooseCreatureType' },
        { kind: 'destroyAll', filter: { notChosenTypeOfSource: true } },
      ],
    },
  },
  'Loyal Tutor': {
    spell: {
      targets: [],
      // "Search your library for a planeswalker card, reveal it, then shuffle and put that card on top."
      effects: [
        {
          kind: 'searchLibrary',
          filter: { types: ['Planeswalker'] },
          to: 'libraryTop',
          reveal: true,
        },
      ],
    },
  },
  'Predictive Preparations': {
    flashback: mana('{3}{W}'),
    spell: {
      // "Put a +1/+1 counter on each of one or two target creatures."
      targets: [creature, { ...creature, optional: true }],
      effects: [
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'counters', to: t1, amount: 1 },
      ],
    },
  },
  'Prophesied End': {
    spell: {
      targets: [creature],
      effects: [
        // "If it wasn't attacking, its controller draws a card." Decided before it's destroyed (and while its
        // controller is still known).
        {
          kind: 'if',
          condition: {
            kind: 'not',
            condition: { kind: 'targetMatches', target: 0, filter: { attacking: true } },
          },
          then: [{ kind: 'draw', who: { controllerOf: 0 }, amount: 1 }],
        },
        { kind: 'destroy', what: t0 },
      ],
    },
  },
  'Refute Destiny': {
    spell: {
      // "Exile target creature or planeswalker that's green or blue. Surveil 1."
      targets: [creatureOrWalker({ colors: ['G', 'U'] })],
      effects: [{ kind: 'exile', what: t0 }, surveil1],
    },
  },
  'Return to the Light Realms': {
    spell: {
      targets: [],
      // "Return all nonland permanent cards from your graveyard to the battlefield." An Aura that comes back
      // this way is attached to something its controller chooses.
      effects: [
        { kind: 'custom', handler: 'returnNonlandPermanents' },
        { kind: 'chooseCustom', handler: 'fraAuraHost' },
      ],
    },
  },
  'Surgical Precision': {
    modes: [
      {
        label: 'Destroy target creature with toughness 4 or greater. You gain 1 life',
        targets: [{ what: 'creature', filter: { minToughness: 4 } }],
        effects: [{ kind: 'destroy', what: t0 }, gain(1)],
      },
      {
        label: 'You draw a card and gain 2 life',
        targets: [],
        effects: [draw(1), gain(2)],
      },
    ],
  },
  'Your Fate Ends Here': {
    spell: {
      // "Destroy target creature or planeswalker with mana value 3 or greater. Surveil 1."
      targets: [creatureOrWalker({ minManaValue: 3 })],
      effects: [{ kind: 'destroy', what: t0 }, surveil1],
    },
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_WHITE_BACKS: Record<string, Behavior> = {
  'Seed Suture (Blossom-Blessed Angel)': {
    spell: {
      // "Put a +1/+1 counter on target creature. You gain 1 life."
      targets: [creature],
      effects: [{ kind: 'counters', to: t0, amount: 1 }, gain(1)],
    },
  },
};

/** Tokens only this group's cards make. */
export const FRA_WHITE_TOKENS: CardDefinition[] = [
  // Saheeli, Consul of Oversight: "a 1/1 colorless Thopter artifact creature token with flying".
  {
    id: FRA_WHITE_THOPTER,
    name: 'Thopter',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Thopter'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
