import type { Behavior } from './build.ts';
import {
  EIDOLONS_CALL,
  EIDOLONS_CALL_BACKS,
  HEROES_ARSENAL,
  HEROES_ARSENAL_BACKS,
} from './fin/equipment-summons.ts';
import { FIN_ADVENTURES, FIN_TOWNS } from './fin/lands.ts';

export { FINAL_FANTASY_TOKENS } from './fin/helpers.ts';

/**
 * Final Fantasy (FIN) card behaviour, one file per pair of decks in fin/
 * (plus others and mythics), merged here. Printed characteristics come from
 * Scryfall; only rules text lives here. Filled in from phase 11a on
 * (docs/final-fantasy-plan.md).
 */
export const FINAL_FANTASY_BEHAVIORS: Record<string, Behavior> = {
  ...HEROES_ARSENAL,
  ...EIDOLONS_CALL,
  ...FIN_TOWNS,
};

/** Back faces of double-faced cards (and Adventures): not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BACK_FACES: Record<string, Behavior> = {
  ...HEROES_ARSENAL_BACKS,
  ...EIDOLONS_CALL_BACKS,
  ...FIN_ADVENTURES,
};
