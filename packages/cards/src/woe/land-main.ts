import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Wilds of Eldraine (23d): the basic lands of the set (their mana abilities come from the basic land types).
 * See docs/wilds-of-eldraine-plan.md.
 */
export const WOE_LAND_MAIN: Record<string, Behavior> = {
  Plains: {},
  Island: {},
  Swamp: {},
  Mountain: {},
  Forest: {},
};

/** Back faces: keyed by their own names. */
export const WOE_LAND_MAIN_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const WOE_LAND_MAIN_TOKENS: CardDefinition[] = [];
