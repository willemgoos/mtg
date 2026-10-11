import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, t0, t1, when } from '../blb/helpers.ts';
import { chapter, spell } from '../fin/helpers.ts';
import { ringTempts, whenYouScry } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): blue rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_BLUE_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

export const LTR_TENTACLE = 'ltr-tentacle-token';

/** "Another target permanent you control" (Goldberry). */
const otherPermanentYouControl: TargetSpec = {
  what: 'permanent',
  controller: 'you',
  filter: { other: true },
};

const stun = (to: typeof t0 | typeof t1): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount: 1,
  to,
});

export const LTR_BLUE_RARE: Record<string, Behavior> = {
  // "You may cast spells this turn as though they had flash. Draw a card."
  'Borne Upon a Wind': spell([], custom('ltrFlashAll'), draw(1)),
  'Goldberry, River-Daughter': {
    abilities: [
      // "{T}: Move a counter of each kind not on Goldberry from another target permanent you control onto Goldberry."
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [otherPermanentYouControl],
        effects: [custom('ltrGoldberryGather')],
      },
      // "{U}, {T}: Move one or more counters from Goldberry onto another target permanent you control. If you do, draw a card."
      // (One counter at a time; the draw comes with the last one moved.)
      {
        kind: 'activated',
        cost: { mana: mana('{U}'), tapSelf: true },
        targets: [otherPermanentYouControl],
        effects: [{ kind: 'chooseCustom', handler: 'ltrGoldberryPick' }],
      },
    ],
  },
  'Lost Isle Calling': {
    abilities: [
      // "Whenever you scry, put a verse counter on this enchantment."
      whenYouScry([{ kind: 'namedCounters', name: 'verse', amount: 1 }]),
      // "{4}{U}{U}, Exile this enchantment: Draw a card for each verse counter on this enchantment. If it had seven or more verse
      // counters on it, take an extra turn after this one. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{U}{U}'), exileSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [
          { kind: 'draw', who: 'controller', amount: { namedCountersOnSource: 'verse' } },
          {
            kind: 'if',
            condition: { kind: 'sourceHadNamedCounter', name: 'verse', min: 7 },
            then: [{ kind: 'extraTurn' }],
          },
        ],
      },
    ],
  },
  'Press the Enemy': {
    // "Return target spell or nonland permanent an opponent controls to its owner's hand. You may cast an instant or sorcery
    // spell with equal or lesser mana value from your hand without paying its mana cost."
    spell: {
      targets: [
        { what: 'spell', orPermanent: true, controller: 'opponent', filter: { nonland: true } },
      ],
      effects: [
        custom('ltrPressBounce'),
        {
          kind: 'castFree',
          what: 'self',
          from: 'hand',
          filter: { types: ['Instant', 'Sorcery'] },
          maxManaValue: { ltrPressMv: true },
        },
      ],
    },
  },
  // Vigilance is printed.
  'Rangers of Ithilien': {
    abilities: [
      // "When this creature enters, gain control of up to one target creature with lesser power for as long as you control this
      // creature. Then the Ring tempts you."
      when(
        { on: 'etb' },
        [{ what: 'creature', optional: true, filter: { lesserPowerThanSource: true } }],
        custom('ltrGainControlWhileControlled'),
        ringTempts,
      ),
    ],
  },
  'Scroll of Isildur': {
    saga: 3,
    abilities: [
      // "I — Gain control of up to one target artifact for as long as you control this Saga. The Ring tempts you."
      chapter(
        [1],
        [{ what: 'permanent', optional: true, filter: { types: ['Artifact'] } }],
        custom('ltrGainControlWhileControlled'),
        ringTempts,
      ),
      // "II — Tap up to two target creatures. Put a stun counter on each of them."
      chapter(
        [2],
        [
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
        ],
        { kind: 'tap', what: t0 },
        { kind: 'tap', what: t1 },
        stun(t0),
        stun(t1),
      ),
      // "III — Draw a card for each tapped creature target opponent controls."
      chapter([3], [{ what: 'player', controller: 'opponent' }], {
        kind: 'draw',
        who: 'controller',
        amount: {
          count: 'permanentsOpponentsControl',
          filter: { types: ['Creature'], tapped: true },
        },
      }),
    ],
  },
  'Storm of Saruman': {
    abilities: [
      // Ward {3} is printed.
      // "Whenever you cast your second spell each turn, copy it, except the copy isn't legendary. You may choose new targets for
      // the copy."
      when({ on: 'castSpell', filter: 'second' }, [], {
        kind: 'copySpell',
        what: 'subject',
        nonlegendary: true,
        newTargets: true,
      }),
    ],
  },
  'The Watcher in the Water': {
    // "The Watcher in the Water enters tapped with nine stun counters on it."
    entersTapped: true,
    entersWithNamedCounters: { stun: 9 },
    abilities: [
      // "Whenever you draw a card during an opponent's turn, create a 1/1 blue Tentacle creature token."
      {
        kind: 'triggered',
        trigger: { on: 'drawCard', whose: 'yours' },
        condition: { kind: 'opponentsTurn' },
        targets: [],
        effects: [{ kind: 'createToken', token: LTR_TENTACLE, count: 1 }],
      },
      // "Whenever a Tentacle you control dies, untap up to one target Kraken and put a stun counter on up to one target nonland
      // permanent."
      when(
        { on: 'creatureYouControlDies', filter: { subtype: 'Tentacle' } },
        [
          { what: 'creature', optional: true, filter: { subtype: 'Kraken' } },
          { what: 'permanent', optional: true, filter: { nonland: true } },
        ],
        { kind: 'untap', what: t0 },
        stun(t1),
      ),
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_BLUE_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_BLUE_RARE_TOKENS: CardDefinition[] = [
  // A 1/1 blue Tentacle creature token (The Watcher in the Water).
  {
    id: LTR_TENTACLE,
    name: 'Tentacle',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Tentacle'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
