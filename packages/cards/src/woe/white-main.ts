import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { food, mana, pump, t0, when, yours, yourCreature, draw } from '../blb/helpers.ts';
import { chapter, spell } from '../fin/helpers.ts';

/**
 * Wilds of Eldraine (23d): white (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_WHITE_MAIN_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

/** The 1/1 white Human creature token (defined in woe/white.ts). */
const HUMAN = 'woe-w-human-token';
const MOUSE = 'woe-w-mouse-token';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

export const WOE_WHITE_MAIN: Record<string, Behavior> = {
  // 2/1. (The Adventure is Squeak By.)
  'Cheeky House-Mouse': {},

  // "At the beginning of your upkeep, if an opponent controls more lands than you, create a Treasure token." "{2}{W}: Choose another
  // player. That player gains control of target Treasure you control. You draw a card." (The one other player.)
  'Discerning Financier': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        condition: { kind: 'opponentHasMore', what: 'lands' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'treasure-token', count: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [{ what: 'permanent', controller: 'you', filter: { subtype: 'Treasure' } }],
        effects: [custom('woeMainGiveControl'), draw(1)],
      },
    ],
  },

  // "Creature tokens you control get +1/+1."
  'Pollen-Shield Hare': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { token: true },
          power: 1,
          toughness: 1,
        },
      },
    ],
  },

  // "Regal Bunnicorn's power and toughness are each equal to the number of nonland permanents you control."
  'Regal Bunnicorn': {
    ptEquals: { count: 'permanentsYouControl', filter: { nonland: true } },
  },

  // "When this creature enters, target creature you control gets +2/+2 until end of turn." (The Adventure is Cleave Shadows.)
  'Shrouded Shepherd': {
    abilities: [when({ on: 'etb' }, [yourCreature], pump(t0, 2, 2))],
  },

  // "I — Create a 1/1 white Mouse creature token. II, III — Create a token that's a copy of target token you control. IV — Creatures
  // you control get +1/+1 and gain vigilance until end of turn."
  'Three Blind Mice': {
    saga: 4,
    abilities: [
      chapter([1], [], { kind: 'createToken', token: MOUSE, count: 1 }),
      chapter([2, 3], [{ what: 'permanent', controller: 'you', filter: { token: true } }], {
        kind: 'tokenCopy',
        of: t0,
      }),
      chapter([4], [], pump(yours, 1, 1, ['vigilance'])),
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_WHITE_MAIN_BACKS: Record<string, Behavior> = {
  // Sorcery — Adventure {W}: "Target creature you control gets +1/+1 until end of turn. It can't be blocked by creatures with power
  // 3 or greater this turn."
  'Squeak By': spell([yourCreature], {
    kind: 'pump',
    to: t0,
    power: 1,
    toughness: 1,
    cantBeBlockedBy: { minPower: 3 },
  }),

  // Instant — Adventure {1}{W}: "Create a 1/1 white Human creature token and a Food token."
  'Have for Dinner': spell([], { kind: 'createToken', token: HUMAN, count: 1 }, food),

  // Sorcery — Adventure {G}: "Target creature you control gains vigilance and gets +X/+X until end of turn, where X is the number of
  // creatures you control."
  'Hare Raising': spell(
    [yourCreature],
    pump(t0, { count: 'creaturesYouControl' }, { count: 'creaturesYouControl' }, ['vigilance']),
  ),

  // Sorcery — Adventure {1}{B}: "Creatures your opponents control get -1/-1 until end of turn."
  'Cleave Shadows': spell([], pump({ each: 'creature', controller: 'opponent' }, -1, -1)),
};

const NO_COST = { generic: 0, colored: {} };

/** Tokens only this group's cards make. */
export const WOE_WHITE_MAIN_TOKENS: CardDefinition[] = [
  // A 1/1 white Mouse creature token (Three Blind Mice).
  {
    id: MOUSE,
    name: 'Mouse',
    manaCost: NO_COST,
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Mouse'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
