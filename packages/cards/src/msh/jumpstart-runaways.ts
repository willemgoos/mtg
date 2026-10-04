import type { Behavior } from '../build.ts';
import { mana, powerUp } from './helpers.ts';

// Marvel Super Heroes Jumpstart: Runaways. Printed characteristics come from Scryfall.
export const MSH_JUMPSTART_RUNAWAYS: Record<string, Behavior> = {
  'Chase Stein, Runaway': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, discard: true },
        targets: [],
        effects: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }],
        label: '{T}, Discard a card: Exile the top card',
      },
    ],
  },
  'Alex Wilder, Runaway': {
    flashback: mana('{2}{R}'),
    escapeExiles: 3,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'selfOrCreatureEtb', filter: {}, castFromNonHand: true },
        targets: [],
        effects: [{ kind: 'pump', to: 'subject', power: 2, toughness: 0, keywords: ['haste'] }],
      },
    ],
  },
  'Molly Hayes, Runaway': {
    abilities: [
      powerUp(
        '{5}{R}',
        { kind: 'counters', to: 'self', amount: 2 },
        { kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' },
      ),
    ],
  },
  'Karolina Dean, Runaway': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [
          { kind: 'addMana', mana: [['W'], ['U'], ['B'], ['R'], ['G']], notForHandSpells: true },
        ],
      },
    ],
  },
  'Nico Minoru, Runaway': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', notFromHand: true },
        targets: [],
        effects: [{ kind: 'damage', to: 'eachOpponent', amount: 2 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}'), tapSelf: true, discard: true },
        targets: [],
        effects: [{ kind: 'exileUntilNonlandCastByDiscard', withoutDiscard: true }],
        label: '{2}{R}, {T}, Discard a card: Exile until a nonland card',
      },
    ],
  },
};
