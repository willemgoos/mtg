import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { food, mana, pump, t0, theirCreature, when, yourCreature, yours } from '../blb/helpers.ts';
import {
  chosenOtherThanThis,
  historic,
  legendaryCreature,
  ringTempts,
  whenRingTempts,
  whenYouCreateToken,
} from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21b): white cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_WHITE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

export const LTR_HALFLING = 'ltr-halfling-token';
const HUMAN_SOLDIER = 'hob-human-soldier-token';

/** "Creature you own" (Slip On the Ring): the spell's controller owns it, whoever controls it. */
const creatureYouOwn: TargetSpec = { what: 'creature', filter: { ownedBySourceController: true } };

/** The Foods you control. */
const foodsYouControl = { count: 'permanentsYouControl', filter: { subtype: 'Food' } } as const;

/** A "When you do" ability: the card's second ability (the first ends in `reflexiveTrigger` with `ability: 1`). */
const reflexive = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'reflexive' }, targets, ...effects);

export const LTR_WHITE: Record<string, Behavior> = {
  'Banish from Edoras': {
    // "This spell costs {2} less to cast if it targets a tapped creature."
    costReductionIfTarget: { filter: { tapped: true }, amount: 2 },
    // "Exile target creature."
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'exile', what: t0 }] },
  },
  'Bill the Pony': {
    abilities: [
      // "When Bill the Pony enters, create two Food tokens."
      when({ on: 'etb' }, [], { kind: 'createToken', token: 'food-token', count: 2 }),
      // "Sacrifice a Food: Until end of turn, target creature you control assigns combat damage equal to its toughness rather than
      // its power."
      {
        kind: 'activated',
        cost: { sacrificePermanent: { subtype: 'Food' } },
        targets: [yourCreature],
        effects: [custom('ltrToughnessRather')],
      },
    ],
  },
  'Eagle of Deliverance': {
    abilities: [
      // "When this creature enters, put an indestructible counter on another target creature you control. Draw a card if that
      // creature's power is 2 or less."
      when(
        { on: 'etb' },
        [{ ...yourCreature, filter: { other: true } }],
        { kind: 'namedCounters', name: 'indestructible', amount: 1, to: t0 },
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { maxPower: 2 } },
          then: [{ kind: 'draw', who: 'controller', amount: 1 }],
        },
      ),
    ],
  },
  'East-Mark Cavalier': {
    abilities: [
      // "Whenever this creature deals damage to a Goblin or Orc, destroy that creature."
      when({ on: 'dealsDamageToCreature', filter: { subtypes: ['Goblin', 'Orc'] } }, [], {
        kind: 'destroy',
        what: 'subject',
      }),
    ],
  },
  'Eastfarthing Farmer': {
    abilities: [
      // "When this creature enters, create a Food token. When you do, target creature you control gets +1/+1 until end of turn for
      // each Food you control."
      when({ on: 'etb' }, [], food, { kind: 'reflexiveTrigger', ability: 1 }),
      reflexive([yourCreature], pump(t0, foodsYouControl, foodsYouControl)),
    ],
  },
  'Errand-Rider of Gondor': {
    abilities: [
      // "When this creature enters, draw a card. Then if you don't control a legendary creature, put a card from your hand on the
      // bottom of your library."
      when(
        { on: 'etb' },
        [],
        { kind: 'draw', who: 'controller', amount: 1 },
        {
          kind: 'if',
          condition: {
            kind: 'not',
            condition: { kind: 'controlsCreature', filter: legendaryCreature },
          },
          then: [{ kind: 'chooseCustom', handler: 'ltrBottomCard' }],
        },
      ),
    ],
  },
  'Escape from Orthanc': {
    // "Target creature gets +1/+3 and gains flying until end of turn. Untap it."
    spell: {
      targets: [{ what: 'creature' }],
      effects: [pump(t0, 1, 3, ['flying']), { kind: 'untap', what: t0 }],
    },
  },
  'Esquire of the King': {
    abilities: [
      // "{4}{W}, {T}: Creatures you control get +1/+1 until end of turn. This ability costs {2} less to activate if you control a
      // legendary creature."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}'), tapSelf: true },
        costReduction: {
          if: { kind: 'controlsCreature', filter: legendaryCreature },
          then: 2,
        },
        targets: [],
        effects: [pump(yours, 1, 1)],
      },
    ],
  },
  'Faramir, Field Commander': {
    abilities: [
      // "At the beginning of your end step, if a creature died under your control this turn, draw a card."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: {
          kind: 'amountAtLeast',
          amount: { count: 'creaturesYouLostThisTurn' },
          min: 1,
        },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
      // "Whenever the Ring tempts you, if you chose a creature other than Faramir as your Ring-bearer, create a 1/1 white Human
      // Soldier creature token."
      whenRingTempts([{ kind: 'createToken', token: HUMAN_SOLDIER, count: 1 }], {
        condition: chosenOtherThanThis,
      }),
    ],
  },
  'Fog on the Barrow-Downs': {
    enchant: { what: 'creature' },
    abilities: [
      // "Enchanted creature is a Spirit and can't attack or block." (It loses all other creature types.)
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          cantAttackOrBlock: true,
          setCreatureSubtype: 'Spirit',
        },
      },
    ],
  },
  "Hobbit's Sting": {
    // "Hobbit's Sting deals X damage to target creature, where X is the number of creatures you control plus the number of Foods
    // you control."
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        {
          kind: 'damage',
          amount: { sum: [{ count: 'creaturesYouControl' }, foodsYouControl] },
          to: t0,
        },
      ],
    },
  },
  'Landroval, Horizon Witness': {
    abilities: [
      // "Whenever two or more creatures you control attack a player, target attacking creature without flying gains flying until
      // end of turn."
      when(
        { on: 'youAttackWithAtLeast', min: 2 },
        [{ what: 'creature', filter: { attacking: true, lacksKeyword: 'flying' } }],
        pump(t0, 0, 0, ['flying']),
      ),
    ],
  },
  'Lost to Legend': {
    // "Put target nonland historic permanent into its owner's library fourth from the top."
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true, anyOf: historic.anyOf! } }],
      effects: [custom('ltrFourthFromTop')],
    },
  },
  'Nimble Hobbit': {
    abilities: [
      // "Whenever this creature attacks, you may sacrifice a Food or pay {2}{W}. When you do, tap target creature an opponent
      // controls."
      when({ on: 'attacks' }, [], { kind: 'chooseCustom', handler: 'ltrNimbleHobbit' }),
      reflexive([theirCreature], { kind: 'tap', what: t0 }),
    ],
  },
  'Rosie Cotton of South Lane': {
    abilities: [
      // "When Rosie Cotton enters, create a Food token."
      when({ on: 'etb' }, [], food),
      // "Whenever you create a token, put a +1/+1 counter on target creature you control other than Rosie Cotton."
      whenYouCreateToken([{ kind: 'counters', to: t0, amount: 1 }], {
        targets: [{ ...yourCreature, filter: { other: true } }],
      }),
    ],
  },
  'Samwise the Stouthearted': {
    abilities: [
      // "When Samwise enters, choose up to one target permanent card in your graveyard that was put there from the battlefield this
      // turn. Return it to your hand. Then the Ring tempts you."
      when(
        { on: 'etb' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            optional: true,
            filter: { diedThisTurn: true },
          },
        ],
        { kind: 'returnToHand', what: t0 },
        ringTempts,
      ),
    ],
  },
  'Saradoc, Master of Buckland': {
    abilities: [
      // "Whenever Saradoc or another nontoken creature you control with power 2 or less enters, create a 1/1 white Halfling
      // creature token."
      when({ on: 'selfOrCreatureEtb', filter: { nontoken: true, maxPower: 2 } }, [], {
        kind: 'createToken',
        token: LTR_HALFLING,
        count: 1,
      }),
      // "Tap two other untapped Halflings you control: Saradoc gets +2/+0 and gains lifelink until end of turn."
      {
        kind: 'activated',
        cost: { tapUntapped: { count: 2, filter: { subtype: 'Halfling', other: true } } },
        targets: [],
        effects: [pump('self', 2, 0, ['lifelink'])],
      },
    ],
  },
  'Second Breakfast': {
    // "Up to two target creatures each get +2/+1 until end of turn. Create a Food token."
    spell: {
      targets: [
        { what: 'creature', optional: true },
        { what: 'creature', optional: true },
      ],
      effects: [pump(t0, 2, 1), pump({ target: 1 }, 2, 1), food],
    },
  },
  'Shire Shirriff': {
    abilities: [
      // "When this creature enters, you may sacrifice a token. When you do, exile target creature an opponent controls until this
      // creature leaves the battlefield."
      when({ on: 'etb' }, [], { kind: 'chooseCustom', handler: 'ltrShireShirriff' }),
      reflexive([theirCreature], { kind: 'exileUntilSourceLeaves', what: t0 }),
    ],
  },
  'Slip On the Ring': {
    // "Exile target creature you own, then return it to the battlefield under your control. The Ring tempts you."
    spell: {
      targets: [creatureYouOwn],
      effects: [{ kind: 'blink', what: t0 }, ringTempts],
    },
  },
  'Soldier of the Grey Host': {
    abilities: [
      // "When this creature enters, target creature gets +2/+0 until end of turn."
      when({ on: 'etb' }, [{ what: 'creature' }], pump(t0, 2, 0)),
    ],
  },
  'Took Reaper': {
    abilities: [
      // "When this creature dies, the Ring tempts you."
      when({ on: 'dies' }, [], ringTempts),
    ],
  },
  'Éowyn, Lady of Rohan': {
    abilities: [
      // "At the beginning of combat on your turn, target creature gains your choice of first strike or vigilance until end of turn.
      // If that creature is equipped, it gains first strike and vigilance until end of turn instead."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [{ what: 'creature' }],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'targetMatches', target: 0, filter: { equipped: true } },
            then: [pump(t0, 0, 0, ['firstStrike', 'vigilance'])],
            else: [
              {
                kind: 'choose',
                title: 'Gains first strike or vigilance until end of turn',
                options: [
                  { label: 'First strike', effects: [pump(t0, 0, 0, ['firstStrike'])] },
                  { label: 'Vigilance', effects: [pump(t0, 0, 0, ['vigilance'])] },
                ],
              },
            ],
          },
        ],
      },
      // "Equip abilities you activate cost {1} less to activate."
      { kind: 'static', effect: { kind: 'equipCostsLess', amount: 1 } },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_WHITE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_WHITE_TOKENS: CardDefinition[] = [
  // A 1/1 white Halfling creature token (Saradoc, Master of Buckland).
  {
    id: LTR_HALFLING,
    name: 'Halfling',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Halfling'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
