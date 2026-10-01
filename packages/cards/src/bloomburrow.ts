import type { Behavior } from './build.ts';
import { BATS_MICE } from './blb/bats-mice.ts';
import { LIZARDS_RATS } from './blb/lizards-rats.ts';
import { BIRDS_RACCOONS } from './blb/birds-raccoons.ts';
import { OTTERS_FROGS } from './blb/otters-frogs.ts';
import { OTHERS } from './blb/others.ts';
import { MYTHICS } from './blb/mythics.ts';
import { SEASONS } from './blb/seasons.ts';
import { SQUIRRELS_RABBITS } from './blb/squirrels-rabbits.ts';

/**
 * Bloomburrow (BLB) card behaviour, one file per pair of animal decks (plus
 * shared shapes in blb/helpers.ts). Printed characteristics come from
 * Scryfall; only rules text lives here.
 */
export const BLOOMBURROW_BEHAVIORS: Record<string, Behavior> = {
  ...SQUIRRELS_RABBITS,
  ...BATS_MICE,
  ...LIZARDS_RATS,
  ...OTTERS_FROGS,
  ...BIRDS_RACCOONS,
  ...OTHERS,
  ...SEASONS,
  ...MYTHICS,
};
