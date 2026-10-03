import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import {
  EIDOLONS_CALL,
  EIDOLONS_CALL_BACKS,
  HEROES_ARSENAL,
  HEROES_ARSENAL_BACKS,
} from './fin/equipment-summons.ts';
import { INTO_THE_VOID, INTO_THE_VOID_BACKS, ROAD_TRIP } from './fin/graveyard-towns.ts';
import { FINAL_FANTASY_TOKENS as FIN_TOKENS_A } from './fin/helpers.ts';
import { FIN_ADVENTURES, FIN_TOWNS } from './fin/lands.ts';
import {
  FORBIDDEN_MAGICKS,
  FORBIDDEN_MAGICKS_BACKS,
  TURKS_CONTRACT,
} from './fin/sacrifice-spellcraft.ts';
import { FIN_TOKENS_B, SHARED_B } from './fin/shared-b.ts';

export const FINAL_FANTASY_TOKENS: CardDefinition[] = [...FIN_TOKENS_A, ...FIN_TOKENS_B];

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
  // 11b (group B)
  ...SHARED_B,
  ...TURKS_CONTRACT,
  ...FORBIDDEN_MAGICKS,
  ...INTO_THE_VOID,
  ...ROAD_TRIP,
};

/** Back faces of double-faced cards (and Adventures): not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BACK_FACES: Record<string, Behavior> = {
  ...HEROES_ARSENAL_BACKS,
  ...EIDOLONS_CALL_BACKS,
  ...FIN_ADVENTURES,
  // 11b (group B)
  ...FORBIDDEN_MAGICKS_BACKS,
  ...INTO_THE_VOID_BACKS,
};
