import type { CardDefinition, CardFilter } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, onEnter, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Squadron (W, flying Heroes of the Squadron Supreme).

const hero: CardFilter = { subtype: 'Hero' };

export const MSH_JUMPSTART_SQUADRON_TOKENS: CardDefinition[] = [
  {
    // Doctor Spectrum: a 0/4 colorless Wall creature token with defender.
    id: 'wall-colorless-token',
    name: 'Wall',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Wall'],
    power: 0,
    toughness: 4,
    keywords: ['defender'],
    abilities: [],
    isToken: true,
  },
];

export const MSH_JUMPSTART_SQUADRON: Record<string, Behavior> = {
  // "Whenever Nighthawk or another Hero you control enters, target creature gets +1/+1 until end of turn."
  'Nighthawk, Dark Defender': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'selfOrCreatureEtb', filter: hero },
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 1, toughness: 1 }],
      },
    ],
  },
  // "Other Heroes you control have exalted": whenever a creature you control attacks alone, it
  // gets +1/+1 for each other Hero you control (one trigger for all the exalted instances).
  'Zarda, the Power Princess': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlAttacks', alone: true },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'subject',
            power: { count: 'creaturesYouControl', subtype: 'Hero', other: true },
            toughness: { count: 'creaturesYouControl', subtype: 'Hero', other: true },
          },
        ],
      },
    ],
  },
  'Doctor Spectrum': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            targets: [],
            effects: [{ kind: 'createToken', token: 'wall-colorless-token', count: 1 }],
          },
          {
            targets: [],
            effects: [
              {
                kind: 'counters',
                to: { each: 'creature', controller: 'you', filter: { ...hero, other: true } },
                amount: 1,
              },
            ],
          },
          {
            targets: [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
            effects: [{ kind: 'destroy', what: t0 }],
          },
        ],
      },
    ],
  },
  'Hyperion, Supreme Hero': {
    abilities: [{ kind: 'static', effect: { kind: 'preventAllButOne', filter: hero } }],
  },
  "Hyperion's Atomic Vision": {
    spell: {
      targets: [{ what: 'creature', filter: { tapped: true } }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
    kicker: {
      cost: { generic: 0, colored: {} },
      behold: hero,
      spell: {
        targets: [{ what: 'creature', filter: { tapped: true } }],
        effects: [
          { kind: 'destroy', what: t0 },
          { kind: 'scry', amount: 2 },
        ],
      },
    },
  },
  'Blur of Heroism': {
    abilities: [
      onEnter(draw(1)),
      { kind: 'static', effect: { kind: 'flashForAll', filter: hero } },
    ],
  },
};
