import type { ConditionDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, t0, t1, teamwork, theirCreature, villain, yourCreature } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) cards for Growing Pains (G/U +1/+1 counters) and
 * Savage Uprising (B/G creature cards in the graveyard).
 */

const twoCreaturesInGraveyard: ConditionDef = {
  kind: 'graveyardCount',
  min: 2,
  types: ['Creature'],
};

export const GROWTH_GRAVEYARD: Record<string, Behavior> = {
  // ----------------------------------------------------------- Growing Pains (G/U)
  'Ant-Man, Colony Commander': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        optional: true,
        cost: mana('{1}'),
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'youPutCounters' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'createToken', token: 'insect-token', count: 1 }],
      },
    ],
  },

  // -------------------------------------------------------- Savage Uprising (B/G)
  'Killmonger, Scourge of Wakanda': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { types: ['Creature'], other: true },
            then: [{ kind: 'destroy', what: t0 }],
          },
        ],
      },
      {
        kind: 'static',
        effect: { kind: 'while', condition: twoCreaturesInGraveyard, power: 2, toughness: 1 },
      },
    ],
  },
  'Arnim Zola, Bio-Fanatic': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        condition: twoCreaturesInGraveyard,
        targets: [],
        effects: [villain(1, true)],
      },
    ],
  },
  'Rapid Rescue': {
    spell: {
      targets: [],
      effects: [
        { kind: 'millThenTake', count: 2, filter: { notTypes: ['Instant', 'Sorcery'] } },
        { kind: 'gainLife', who: 'controller', amount: 2 },
      ],
    },
  },
  'Punishing Punch': {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [
        { kind: 'damage', amount: { multiply: 2, amount: { powerOf: t0 } }, to: t1, from: t0 },
      ],
    },
    costReduction: { if: twoCreaturesInGraveyard, then: 2 },
  },
  'Too Evil to Stay Dead': teamwork(
    4,
    {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Creature'], maxManaValue: 4 },
        },
      ],
      effects: [{ kind: 'returnToBattlefield', what: t0 }],
    },
    {
      targets: [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
      effects: [{ kind: 'returnToBattlefield', what: t0 }],
    },
  ),
};
