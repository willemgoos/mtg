import type { Behavior } from '../build.ts';

/**
 * Strixhaven (13b): the Prismari Lessons. Introduction to Prophecy,
 * Expanded Anatomy and Start from Scratch are shared (lorehold.ts).
 */
export const PRISMARI_LESSONS: Record<string, Behavior> = {
  'Elemental Summoning': {
    spell: {
      targets: [],
      effects: [{ kind: 'createToken', token: 'stx-elemental-ur-token', count: 1 }],
    },
  },
};
