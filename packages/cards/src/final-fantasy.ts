import type { Behavior } from './build.ts';

/**
 * Final Fantasy (FIN) card behaviour, one file per pair of decks in fin/
 * (plus others and mythics), merged here. Printed characteristics come from
 * Scryfall; only rules text lives here. Filled in from phase 11a on
 * (docs/final-fantasy-plan.md).
 */
export const FINAL_FANTASY_BEHAVIORS: Record<string, Behavior> = {};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BACK_FACES: Record<string, Behavior> = {};
