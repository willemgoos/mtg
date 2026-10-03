import type { Amount } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { gain, mana, onEnter, t0, theirCreature } from './helpers.ts';
import { food, permanentCardsInGraveyard, towns, triggered } from './shared-b.ts';

/**
 * Final Fantasy (FIN) 11b, group B: the gold cards of Into the Void (B/G
 * permanents in the graveyard) and Road Trip (G/U lands and Towns). Their
 * mono-coloured cards are in shared-b.ts.
 */

// ------------------------------------------------------------ B/G: Into the Void

export const INTO_THE_VOID: Record<string, Behavior> = {
  'Exdeath, Void Warlock': {
    abilities: [
      onEnter(gain(3)),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: {
          kind: 'amountAtLeast',
          amount: permanentCardsInGraveyard,
          min: 6,
        },
        targets: [],
        effects: [{ kind: 'transform', what: 'self' }],
      },
    ],
  },
  'Cloud of Darkness': {
    abilities: [
      triggered({ on: 'etb' }, [theirCreature], {
        kind: 'pump',
        to: t0,
        power: { multiply: -1, amount: permanentCardsInGraveyard },
        toughness: { multiply: -1, amount: permanentCardsInGraveyard },
      }),
    ],
  },
};

/** Back faces (not cards of their own). */
export const INTO_THE_VOID_BACKS: Record<string, Behavior> = {
  "Neo Exdeath, Dimension's End": { powerEquals: permanentCardsInGraveyard },
};

// ------------------------------------------------------------ G/U: Road Trip

/** "The number of nonbasic lands you control". */
const nonbasicLands: Amount = {
  sum: [
    { count: 'landsYouControl' },
    { multiply: -1, amount: { count: 'landsYouControl', basicOnly: true } },
  ],
};

export const ROAD_TRIP: Record<string, Behavior> = {
  'Ignis Scientia': {
    abilities: [
      onEnter({
        kind: 'lookAndTake',
        count: 6,
        filter: { types: ['Land'] },
        to: 'battlefieldTapped',
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}{U}'), tapSelf: true },
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'exileGraveyardCard', what: t0, ifCreature: [food] }],
        label: "I've Come Up with a New Recipe!",
      },
    ],
  },
  'Omega, Heartless Evolution': {
    abilities: [
      triggered(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true }, optional: true }],
        { kind: 'tap', what: t0 },
        { kind: 'namedCounters', name: 'stun', amount: nonbasicLands, to: t0 },
        gain(nonbasicLands),
      ),
    ],
  },
  'The Wandering Minstrel': {
    abilities: [
      { kind: 'static', effect: { kind: 'landsEnterUntapped' } },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: {
          kind: 'controlsPermanents',
          filter: { types: ['Land'], subtype: 'Town' },
          min: 5,
        },
        targets: [],
        effects: [{ kind: 'createToken', token: 'fin-elemental-token', count: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{W}{U}{B}{R}{G}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { other: true } },
            power: towns,
            toughness: towns,
          },
        ],
      },
    ],
  },
};
