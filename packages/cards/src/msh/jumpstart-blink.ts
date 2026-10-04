import type { Behavior } from '../build.ts';
import { creature, mana, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Blink packet (docs/marvel-jumpstart.md): the cards it
// was missing. Mob Lookout (Conniving), Justice, Victor Timely, Shipwreck Patrol, We Say
// Thee Nay!, Dismissive Denial and Thriving Isle are shared with other packets.

export const MSH_JUMPSTART_BLINK: Record<string, Behavior> = {
  // Flying comes from Scryfall.
  "Shi'ar Soldier": {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{U}'), tapSelf: true },
        targets: [{ what: 'permanent', controller: 'you', filter: { other: true } }],
        effects: [{ kind: 'bounce', what: t0 }],
        // "Activate only during your turn."
        condition: { kind: 'yourTurn' },
      },
    ],
  },
  // Vigilance comes from Scryfall.
  'Imperial Cosmographer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'leavesWithoutDying', who: 'other' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 2 }],
      },
    ],
  },
  // Flash and flying come from Scryfall.
  'Silver Surfer, Cosmic Voyager': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          { what: 'permanent', controller: 'you', filter: { other: true }, anyNumber: true },
        ],
        effects: [
          {
            kind: 'exileUntilEndStep',
            what: { targetsFrom: 0 },
            together: true,
            landsTapped: true,
          },
        ],
      },
    ],
  },
  Spaceshift: {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }],
      effects: [{ kind: 'blink', what: t0, counters: 1 }],
    },
  },
  "Collector's Case": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ ...creature, optional: true }],
        effects: [
          { kind: 'tap', what: t0 },
          { kind: 'namedCounters', name: 'stun', amount: 2, to: t0 },
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}'), tapSelf: true },
        targets: [creature],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },
};
