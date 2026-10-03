import type { Behavior } from '../build.ts';
import { opus } from './helpers.ts';

/**
 * Secrets of Strixhaven (14a): a few real cards that exercise the fetch path
 * (prepare layout, Opus). The rest come with the decks (14b) and the rares (14c).
 * A prepare spell's record is named "Spell (Creature)" (its id is its slug), so
 * back faces named like real cards (Lightning Bolt) don't collide with them.
 */
const anyTarget = { what: 'any' } as const;

export const PREPARE_SPIKE: Record<string, Behavior> = {
  'Goblin Glasswright': { entersPrepared: true },
  'Emeritus of Conflict': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'third' },
        targets: [],
        effects: [{ kind: 'prepare', what: 'self' }],
      },
    ],
  },
  'Tackle Artist': {
    abilities: [
      opus(
        [{ kind: 'counters', to: 'self', amount: 1 }],
        [{ kind: 'counters', to: 'self', amount: 2 }],
      ),
    ],
  },
};

export const PREPARE_SPIKE_BACKS: Record<string, Behavior> = {
  'Craft with Pride (Goblin Glasswright)': {
    spell: { targets: [], effects: [{ kind: 'createToken', token: 'treasure-token', count: 1 }] },
  },
  'Lightning Bolt (Emeritus of Conflict)': {
    spell: {
      targets: [anyTarget],
      effects: [{ kind: 'damage', amount: 3, to: { target: 0 } }],
    },
  },
};
