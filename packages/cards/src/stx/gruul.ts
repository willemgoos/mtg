import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, t0 } from '../blb/helpers.ts';
import { equip } from '../msc/helpers.ts';

/**
 * Strixhaven (13b): the Gruul deck (R/G, off-college): big creatures, burn
 * and fight from mono-red, mono-green and colourless cards. Most of its cards
 * were built for earlier decks; only the new ones live here.
 */

/** No tokens of its own. */
export const GRUUL_TOKENS: CardDefinition[] = [];

export const GRUUL: Record<string, Behavior> = {
  'Hall Monitor': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), tapSelf: true },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBlock: true }],
      },
    ],
  },
  'Reckless Amplimancer': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: { powerOf: 'self' },
            toughness: { toughnessOf: 'self' },
          },
        ],
      },
    ],
  },
  'Mascot Interception': {
    costReductionIfTarget: { filter: { token: true, types: ['Creature'] }, amount: 3 },
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        { kind: 'pump', to: t0, power: 2, toughness: 0, keywords: ['haste'] },
      ],
    },
  },
  'Team Pennant': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 1,
          toughness: 1,
          keywords: ['vigilance', 'trample'],
        },
      },
      equip('{1}', { token: true }, 'Equip creature token {1}'),
      equip('{3}'),
    ],
  },
};
