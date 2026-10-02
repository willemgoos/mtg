import type { Behavior } from '../build.ts';
import { connive, draw, onEnter, powerUp } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) mythics. Printed characteristics come from
 * Scryfall; only rules text lives here.
 */

export const MSH_MYTHICS: Record<string, Behavior> = {
  "Captain Marvel, Earth's Protector": {
    abilities: [
      powerUp(
        '{5}{W}{W}',
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'namedCounters', name: 'indestructible', amount: 1, to: 'self' },
      ),
    ],
  },
  'Doctor Doom': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'doombot-token', count: 2 }),
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'controlsPermanents',
            filter: {
              anyOf: [
                { types: ['Artifact'], anyOf: [{ types: ['Creature'] }] },
                { subtype: 'Plan' },
              ],
            },
            min: 1,
          },
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
      },
    ],
  },
  'M.O.D.O.K.': {
    abilities: [
      {
        kind: 'activated',
        cost: { life: 3 },
        condition: { kind: 'yourTurn' },
        targets: [],
        effects: [connive],
        label: 'Mental Organism: pay 3 life, connive',
      },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesOpponentsControl',
          power: -1,
          toughness: -1,
        },
      },
    ],
  },
  'Multiversal Incursion': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'tokenCopy',
          of: { each: 'creature', controller: 'you', filter: { nontoken: true } },
          notLegendary: true,
        },
      ],
    },
  },
};
