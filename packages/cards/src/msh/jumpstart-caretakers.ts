import type { Behavior } from '../build.ts';
import { powerUp, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart: Caretakers. Printed keywords come from Scryfall.
export const MSH_JUMPSTART_CARETAKERS: Record<string, Behavior> = {
  'Crowd of True Believers': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ ...yourCreature, filter: { attackingAlone: true } }],
        effects: [
          { kind: 'pump', to: t0, power: 1, toughness: 0 },
          { kind: 'gainLife', who: 'controller', amount: 1 },
        ],
      },
    ],
  },
  'Donald Blake, Guise of Thor': {
    abilities: [
      powerUp(
        '{4}{W}{W}',
        { kind: 'counters', to: 'self', amount: 2 },
        { kind: 'namedCounters', name: 'flying', amount: 1 },
        { kind: 'setCreatureTypes', what: 'self', subtypes: ['God', 'Warrior', 'Hero'] },
      ),
    ],
  },
  'MJ, Rising Star': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Virtuous Variant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  'Doctor Jane Foster': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'lifeThisTurn', who: 'you', gained: true },
            then: [{ kind: 'returnToBattlefield', what: t0 }],
            else: [{ kind: 'returnToHand', what: t0 }],
          },
        ],
      },
    ],
  },
  'Doctor Strange, Surgeon': {
    abilities: [
      { kind: 'static', effect: { kind: 'doubleLifeGain' } },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'each' },
        condition: { kind: 'lifeAboveStarting', amount: 10 },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'lifeAboveStarting', amount: 10 },
            then: [
              {
                kind: 'pump',
                to: { each: 'creature', controller: 'you' },
                power: 2,
                toughness: 2,
                keywords: ['vigilance'],
              },
            ],
          },
        ],
      },
    ],
  },
};
