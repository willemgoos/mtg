import type { Amount, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { pump } from '../blb/helpers.ts';
import { powerUp, t0, t1, t2, theirCreature, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Towering packet (docs/marvel-jumpstart.md):
// the cards it was missing. Terrific Team-Up is shared with Savage Lands.

/** "for each creature you control with power 4 or greater" */
const bigCreatures: Amount = {
  count: 'permanentsYouControl',
  filter: { types: ['Creature'], minPower: 4 },
};

/** "<creature> gets +1/+0 until end of turn and deals damage equal to its power to <their creature>." */
const teamUp = (who: typeof t0 | typeof t2): EffectDef[] => [
  pump(who, 1, 0),
  { kind: 'damage', amount: { powerOf: who }, to: t1, from: who },
];

export const MSH_JUMPSTART_TOWERING: Record<string, Behavior> = {
  // Reach comes from Scryfall.
  'Goliath, Mass Manipulator': {
    abilities: [
      powerUp(
        '{4}{G}',
        { kind: 'counters', to: 'self', amount: 2 },
        { kind: 'draw', who: 'controller', amount: bigCreatures },
      ),
    ],
  },
  // Reach comes from Scryfall.
  'Giant-Man, Gargantuan Genius': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['G']], count: bigCreatures }],
      },
    ],
  },
  // Reach, trample and ward {2} come from Scryfall.
  'Spider-Rex, Daring Dino': {},
  /**
   * "One or two target creatures you control": the first of yours, then the
   * opponent's creature, then (optionally) the second of yours.
   */
  'Terrific Team-Up': {
    costReductionIf: {
      condition: { kind: 'controlsPermanents', filter: { minManaValue: 4 }, min: 1 },
      amount: 2,
    },
    spell: {
      targets: [yourCreature, theirCreature, { ...yourCreature, optional: true }],
      effects: [...teamUp(t0), ...teamUp(t2)],
    },
  },
};
