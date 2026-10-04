import type { Behavior } from '../build.ts';
import {
  condition,
  counters,
  creatureCard,
  draw,
  reanimate,
  self,
  t0,
  treasure,
  when,
  yours,
} from './helpers.ts';

/**
 * Brawl Aerith, Last Ancient (12e), the Arena Store Brawl deck (G/W): life
 * gain, Birds and legends. Its cards that aren't Final Fantasy booster cards
 * or shared lands.
 */

export const AERITH: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Aerith, Last Ancient': {
    abilities: [
      // Raise — to your hand, or onto the battlefield if you gained 7 or more life this turn.
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [creatureCard()], {
          kind: 'if',
          condition: condition('gainedSeven'),
          then: reanimate(0),
          else: [{ kind: 'returnToHand', what: t0 }],
        }),
        condition: { kind: 'lifeThisTurn', who: 'you', gained: true },
      },
    ],
  },
  // ------------------------------------------------------------ creatures
  'Tataru Taru': {
    abilities: [
      // "Target opponent may draw a card": they always do (a simplification).
      when({ on: 'etb' }, [], draw(1), { kind: 'draw', who: 'eachOpponent', amount: 1 }),
      {
        ...when({ on: 'drawCard', whose: 'opponents' }, [], treasure(1, { tapped: true })),
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
      },
    ],
  },
  'Wakka, Devoted Guardian': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Artifact'] },
            optional: true,
          },
        ],
        { kind: 'destroy', what: t0 },
        counters(self),
      ),
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [], counters(yours({ other: true }))),
        condition: condition('sourceCountersThisTurn'),
      },
    ],
  },
};
