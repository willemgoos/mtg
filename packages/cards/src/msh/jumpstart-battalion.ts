import type { AbilityDef, EffectDef, Ref } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Battalion (W, attacking in groups).

/** "Battalion — Whenever this and at least two other creatures attack, ..." */
const battalion = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks', battalion: true },
  targets: [],
  effects,
});

/** "Attacking creatures" (anyone's; only the active player's can be attacking). */
const attackingCreatures: Ref = { each: 'creature', filter: { attacking: true } };

export const MSH_JUMPSTART_BATTALION: Record<string, Behavior> = {
  // First strike comes from Scryfall.
  'General Thunderbolt Ross': {
    abilities: [battalion({ kind: 'pump', to: attackingCreatures, power: 1, toughness: 0 })],
  },
  'Wild Pack Squad': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [{ ...creature, optional: true }],
        effects: [
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['firstStrike', 'vigilance'] },
        ],
      },
    ],
  },
  // Flying and lifelink come from Scryfall.
  'Falcon, Joaquin Torres': {
    abilities: [
      battalion({ kind: 'counters', to: 'self', amount: 1 }, { kind: 'scry', amount: 1 }),
    ],
  },
  // Flying comes from Scryfall.
  'War Machine, James Rhodes': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [{ ...creature, optional: true }],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },
  // Flying and vigilance come from Scryfall.
  'Captain America, Skybound': {
    abilities: [
      battalion(
        { kind: 'counters', to: attackingCreatures, amount: 1 },
        {
          kind: 'pump',
          to: attackingCreatures,
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
        },
      ),
    ],
  },
};
