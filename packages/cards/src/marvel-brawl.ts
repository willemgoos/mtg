import type { Behavior } from './build.ts';
import { STAPLES } from './msc/staples.ts';

/**
 * Marvel Super Heroes Commander (MSC) card behaviour for the four Brawl
 * precons: the shared staples, then one file per deck. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */
export const MARVEL_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...STAPLES,
};
