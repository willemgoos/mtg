import type { Behavior } from '../build.ts';
import { draw, t0 } from '../blb/helpers.ts';

/** Lessons for the Azorius Skies sideboard (Learn fetches them). */
export const LESSONS_AZORIUS: Record<string, Behavior> = {
  // Uses the Elemental token from stx/quandrix.ts.
  'Elemental Summoning': {
    spell: {
      targets: [],
      effects: [{ kind: 'createToken', token: 'stx-elemental-ur-token', count: 1 }],
    },
  },
  'Introduction to Annihilation': {
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'draw', who: { controllerOf: 0 }, amount: 1 },
      ],
    },
  },
  'Teachings of the Archaics': {
    // Simplified: draws two when an opponent has more cards in hand (never three).
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'opponentHasMore', what: 'cards' },
          then: [draw(2)],
        },
      ],
    },
  },
};
