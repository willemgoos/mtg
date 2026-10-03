import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import {
  HIGHWIND_WORKSHOP,
  TIME_COMPRESSION,
  TIME_COMPRESSION_BACKS,
} from './fin/artifacts-graveyard.ts';
import {
  EIDOLONS_CALL,
  EIDOLONS_CALL_BACKS,
  HEROES_ARSENAL,
  HEROES_ARSENAL_BACKS,
} from './fin/equipment-summons.ts';
import { INTO_THE_VOID, INTO_THE_VOID_BACKS, ROAD_TRIP } from './fin/graveyard-towns.ts';
import { FINAL_FANTASY_TOKENS as BASE_TOKENS } from './fin/helpers.ts';
import { FIN_ADVENTURES, FIN_TOWNS } from './fin/lands.ts';
import {
  FORBIDDEN_MAGICKS,
  FORBIDDEN_MAGICKS_BACKS,
  TURKS_CONTRACT,
} from './fin/sacrifice-spellcraft.ts';
import { RARES_1, RARES_1_BACKS, RARES_1_TOKENS } from './fin/rares-1.ts';
import { RARES_2, RARES_2_BACKS } from './fin/rares-2.ts';
import { SHARED_A, SHARED_A_BACKS, SHARED_A_TOKENS } from './fin/shared-a.ts';
import { FIN_TOKENS_B, SHARED_B } from './fin/shared-b.ts';
import {
  BLACK_MAGES_WALTZ,
  BLACK_MAGES_WALTZ_BACKS,
  CHOCOBO_STAMPEDE,
} from './fin/spells-landfall.ts';

export const FINAL_FANTASY_TOKENS: CardDefinition[] = [
  ...BASE_TOKENS,
  ...SHARED_A_TOKENS,
  ...FIN_TOKENS_B,
  ...RARES_1_TOKENS,
];

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
  // 11b (group A)
  ...SHARED_A,
  ...HIGHWIND_WORKSHOP,
  ...TIME_COMPRESSION,
  ...BLACK_MAGES_WALTZ,
  ...CHOCOBO_STAMPEDE,
  // 11b (group B)
  ...SHARED_B,
  ...TURKS_CONTRACT,
  ...FORBIDDEN_MAGICKS,
  ...INTO_THE_VOID,
  ...ROAD_TRIP,
  // 11c (group 1)
  ...RARES_1,
  // 11c (group 2)
  ...RARES_2,
};

/** Back faces of double-faced cards (and Adventures): not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BACK_FACES: Record<string, Behavior> = {
  ...HEROES_ARSENAL_BACKS,
  ...EIDOLONS_CALL_BACKS,
  ...FIN_ADVENTURES,
  // 11b (group A)
  ...SHARED_A_BACKS,
  ...TIME_COMPRESSION_BACKS,
  ...BLACK_MAGES_WALTZ_BACKS,
  // 11b (group B)
  ...FORBIDDEN_MAGICKS_BACKS,
  ...INTO_THE_VOID_BACKS,
  // 11c (group 1)
  ...RARES_1_BACKS,
  // 11c (group 2)
  ...RARES_2_BACKS,
};
