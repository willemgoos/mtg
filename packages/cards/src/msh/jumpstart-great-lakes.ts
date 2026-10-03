import type { Behavior } from '../build.ts';
import { creature, mana, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Great Lakes Avengers packet (docs/marvel-jumpstart.md):
// the cards it was missing. Tippy-Toe and Beast Mode are in the Animal packet.

export const MSH_JUMPSTART_GREAT_LAKES: Record<string, Behavior> = {
  Doorman: {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [creature],
        effects: [
          {
            kind: 'pump',
            to: t0,
            power: 0,
            toughness: 0,
            cantBeBlockedBy: { anyOf: [{ maxPower: 2 }, { subtype: 'Wall' }] },
          },
        ],
      },
    ],
  },
  'Mister Immortal': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}') },
        fromGraveyard: true,
        fromExile: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true }],
      },
    ],
  },
  Flatman: {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, switchPT: true }],
        label: 'Origami-Fu',
      },
    ],
  },
  'Big Bertha': {
    entersWithXCounters: true,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
};
