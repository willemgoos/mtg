import type { EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, gain, onEnter, t0, t1, t2 } from '../fin/helpers.ts';

/**
 * Secrets of Strixhaven (14a): the five cards both 14a decks (Silverquill Debate
 * Club and Witherbloom Pest Control) play. Kept in one file so they merge once.
 */

const drain = (amount: number): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  gain(amount),
];

export const SHARED_14A: Record<string, Behavior> = {
  'Sneering Shadewriter': { abilities: [onEnter(...drain(2))] },
  'Last Gasp': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: -3, toughness: -3 }],
    },
  },
  // Infusion: its controller loses 3 life if you gained life this turn.
  'Foolish Fate': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'destroy', what: t0 },
        {
          kind: 'if',
          condition: { kind: 'lifeThisTurn', who: 'you', gained: true },
          then: [{ kind: 'loseLife', who: { controllerOf: 0 }, amount: 3 }],
        },
      ],
    },
  },
  'Wander Off': { spell: { targets: [creature], effects: [{ kind: 'exile', what: t0 }] } },
  // Simplified: the two "up to one" creature targets are chosen in order (skipping the first skips the second).
  'Dissection Practice': {
    spell: {
      targets: [
        { what: 'player', controller: 'opponent' },
        { what: 'creature', optional: true },
        { what: 'creature', optional: true },
      ],
      effects: [
        { kind: 'loseLife', who: t0, amount: 1 },
        gain(1),
        { kind: 'pump', to: t1, power: 1, toughness: 1 },
        { kind: 'pump', to: t2, power: -1, toughness: -1 },
      ],
    },
  },
};
