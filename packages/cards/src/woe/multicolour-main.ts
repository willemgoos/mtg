import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana } from '../blb/helpers.ts';

/**
 * Wilds of Eldraine (23d): multicolour (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. See docs/wilds-of-eldraine-plan.md.
 */
export const WOE_MULTICOLOUR_MAIN: Record<string, Behavior> = {
  // Flying. "{T}: Draw a card, then discard a card." "{X}: This creature becomes a copy of target creature card in your graveyard
  // with mana value X, except it has flying and this ability. Activate only as a sorcery." (Ability 1 is the one the copy keeps.)
  'Likeness Looter': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          { kind: 'draw', who: 'controller', amount: 1 },
          { kind: 'discard', count: 1 },
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{X}') },
        sorcerySpeed: true,
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], manaValueEqualsX: true },
          },
        ],
        effects: [{ kind: 'custom', handler: 'woeMainLooterCopy' }],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_MULTICOLOUR_MAIN_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const WOE_MULTICOLOUR_MAIN_TOKENS: CardDefinition[] = [];
