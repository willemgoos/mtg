import type { Behavior } from '../build.ts';
import { creature, draw, secondDraw, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Geniuses packet (docs/marvel-jumpstart.md): the cards it was
// missing. Beast, Erudite Aerialist is shared with Uncanny, Fantastic Bounce with Fantastic.

export const MSH_JUMPSTART_GENIUSES: Record<string, Behavior> = {
  // "As long as you've put one or more +1/+1 counters on Beast this turn, he has flying."
  'Beast, Erudite Aerialist': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'custom', handler: 'sourceCountersThisTurn' },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // Flying and ward {2} come from Scryfall.
  'Blue Marvel, Adam Brashear': {
    abilities: [secondDraw([], { kind: 'counters', to: 'self', amount: 1 })],
  },
  // Reach comes from Scryfall.
  'Reed Richards, Smartest Man': {
    abilities: [
      { kind: 'static', effect: { kind: 'noMaxHandSize' } },
      { kind: 'static', effect: { kind: 'firstExtraDrawBecomes', count: 4 } },
    ],
  },
  'Super Intelligence': {
    enchant: creature,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'enchantedController' },
        targets: [],
        effects: [{ kind: 'draw', who: 'attachedController', amount: 1 }],
      },
    ],
  },
  'Fantastic Bounce': {
    costReductionIfTarget: { filter: { tapped: true, types: ['Creature'] }, amount: 2 },
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [{ kind: 'bounce', what: t0 }, draw(1)],
    },
  },
};
