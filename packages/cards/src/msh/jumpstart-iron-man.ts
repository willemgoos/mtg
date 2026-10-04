import type { Behavior } from '../build.ts';
import { mana, onEnter, t0, theirCreature } from './helpers.ts';

export const MSH_JUMPSTART_IRON_MAN: Record<string, Behavior> = {
  'Iron Man, Bleeding Edge': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: { types: ['Artifact'] } },
        targets: [],
        effects: [
          {
            kind: 'may',
            oncePerTurn: 'artifact-copy',
            effects: [{ kind: 'copySpell', what: 'subject', nonlegendary: true }],
          },
        ],
      },
    ],
  },
  'Happy Hogan, Bodyguard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [
          {
            kind: 'choose',
            ownerOf: 0,
            options: [
              {
                label: 'Second from the top',
                effects: [{ kind: 'putInLibrary', what: t0, position: 'second' }],
              },
              {
                label: 'On the bottom',
                effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
              },
            ],
          },
        ],
      },
    ],
  },
  'Iron Suitcase': {
    abilities: [
      onEnter({ kind: 'scry', amount: 2 }),
      {
        kind: 'activated',
        cost: { mana: mana('{3}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: 0,
            toughness: 0,
            basePT: [3, 3],
            becomesCreature: true,
            creatureSubtype: 'Construct',
            keywords: ['flying'],
          },
        ],
      },
    ],
  },
  'Origin of Iron Man': {
    saga: 3,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'chapter', chapters: [1] },
        targets: [{ what: 'creature', optional: true }],
        effects: [
          { kind: 'tap', what: t0 },
          { kind: 'doesntUntapWhileSource', what: t0 },
        ],
      },
      {
        kind: 'triggered',
        trigger: { on: 'chapter', chapters: [2] },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 2 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'chapter', chapters: [3] },
        targets: [],
        effects: [
          {
            kind: 'putFromHandOrGraveyard',
            handOnly: true,
            filter: { types: ['Artifact'], maxManaValue: 5 },
          },
        ],
      },
    ],
  },
};
