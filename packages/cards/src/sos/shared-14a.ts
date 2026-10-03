import type { ConditionDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, drain, gain, onEnter, pump, t0, t1 } from '../blb/helpers.ts';

/**
 * Secrets of Strixhaven (14a): the five cards both 14a decks play (Silverquill
 * Debate Club and Witherbloom Pest Control). One definition for both.
 */

const gainedLife: ConditionDef = { kind: 'lifeThisTurn', who: 'you', gained: true };
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const upToOneCreature: TargetSpec = { ...creature, optional: true };

export const SOS_SHARED_14A: Record<string, Behavior> = {
  'Sneering Shadewriter': { abilities: [onEnter(...drain(2))] },
  'Last Gasp': { spell: { targets: [creature], effects: [pump(t0, -3, -3)] } },
  'Foolish Fate': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'destroy', what: t0 },
        {
          kind: 'if',
          condition: gainedLife,
          then: [{ kind: 'loseLife', who: { controllerOf: 0 }, amount: 3 }],
        },
      ],
    },
  },
  'Wander Off': { spell: { targets: [creature], effects: [{ kind: 'exile', what: t0 }] } },
  'Dissection Practice': {
    spell: {
      targets: [opponent, upToOneCreature, upToOneCreature],
      effects: [
        { kind: 'loseLife', who: t0, amount: 1 },
        gain(1),
        pump(t1, 1, 1),
        pump({ target: 2 }, -1, -1),
      ],
    },
  },
};
