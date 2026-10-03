import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew, draw, onEnter, t0, theirCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Agents of S.H.I.E.L.D. (W, creatures attacking alone).

/** "Whenever a creature you control attacks alone, ..." (the attacker is 'subject'). */
const attacksAlone = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'creatureYouControlAttacks', alone: true },
  targets,
  effects,
});

const indestructible = (to: 'subject' | 'chosen'): EffectDef => ({
  kind: 'pump',
  to,
  power: 0,
  toughness: 0,
  keywords: ['indestructible'],
});

export const MSH_JUMPSTART_SHIELD: Record<string, Behavior> = {
  'Peggy Carter, Secret Agent': {
    abilities: [attacksAlone([], indestructible('subject'))],
  },
  'S.H.I.E.L.D. Helicarrier': {
    abilities: [onEnter({ kind: 'createToken', token: 'soldier-token', count: 2 }), crew(6)],
  },
  'Nick Fury, Spymaster': {
    abilities: [
      // "You may put": the pick can be declined.
      attacksAlone(
        [],
        draw(1),
        {
          kind: 'putFromHandOrGraveyard',
          filter: { types: ['Creature'], maxManaValue: 3 },
          handOnly: true,
          attackingIf: { types: ['Creature'] },
        },
        indestructible('chosen'),
      ),
    ],
  },
  // Two triggers, so the +1/+1 still happens when no creature is tapped: choosing no
  // target declines a trigger here. "Defending player": the opponent (two-player games).
  'Strategic Intervention': {
    abilities: [
      attacksAlone([], { kind: 'pump', to: 'subject', power: 1, toughness: 1 }),
      attacksAlone([{ ...theirCreature, optional: true }], { kind: 'tap', what: t0 }),
    ],
  },
};
