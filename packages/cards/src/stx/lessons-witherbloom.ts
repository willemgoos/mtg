import type { Behavior } from '../build.ts';
import { gain, t0 } from '../blb/helpers.ts';

/** Strixhaven (13b): the Witherbloom Lessons (the deck's sideboard, fetched by Learn). */

const PEST = 'stx-pest-token';

export const LESSONS_WITHERBLOOM: Record<string, Behavior> = {
  'Pest Summoning': {
    spell: { targets: [], effects: [{ kind: 'createToken', token: PEST, count: 2 }] },
  },
  'Basic Conjuration': {
    spell: {
      targets: [],
      effects: [{ kind: 'lookAndTake', count: 6, filter: { types: ['Creature'] } }, gain(3)],
    },
  },
  'Containment Breach': {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
      effects: [
        { kind: 'destroy', what: t0 },
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { maxManaValue: 2 } },
          then: [{ kind: 'createToken', token: PEST, count: 1 }],
        },
      ],
    },
  },
};
