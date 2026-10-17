import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, t0 } from '../blb/helpers.ts';

/**
 * Wilds of Eldraine (23d): colorless (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. See docs/wilds-of-eldraine-plan.md.
 */
export const WOE_COLORLESS_MAIN: Record<string, Behavior> = {
  // "{T}: Add {C}." "Whenever a legendary creature you control enters, you may have The Irencrag become a legendary Equipment
  // artifact named Everflame, Heroes' Legacy. If you do, it gains equip {3} and 'Equipped creature gets +3/+3' and loses all other
  // abilities." (The new definition is `everflameDef` in the engine.)
  'The Irencrag': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      {
        kind: 'triggered',
        trigger: {
          on: 'otherCreatureEtb',
          controller: 'you',
          filter: { supertypes: ['Legendary'] },
        },
        targets: [],
        effects: [{ kind: 'may', effects: [{ kind: 'custom', handler: 'woeMainEverflame' }] }],
      },
    ],
  },

  // "{2}, {T}: Choose one that hasn't been chosen — • This artifact deals 2 damage to target creature. • Tap target creature. •
  // Sacrifice this artifact. You gain 3 life." Each mode is its own ability that can be activated once (the mode is chosen as it is
  // activated, so "once" is exactly "one that hasn't been chosen").
  'Three Bowls of Porridge': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        once: true,
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'damage', amount: 2, to: t0, from: 'self' }],
        label: '{2}, {T}: This artifact deals 2 damage to target creature',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        once: true,
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'tap', what: t0 }],
        label: '{2}, {T}: Tap target creature',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        once: true,
        targets: [],
        effects: [
          { kind: 'sacrifice', what: 'self' },
          { kind: 'gainLife', who: 'controller', amount: 3 },
        ],
        label: '{2}, {T}: Sacrifice this artifact. You gain 3 life',
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_COLORLESS_MAIN_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const WOE_COLORLESS_MAIN_TOKENS: CardDefinition[] = [];
