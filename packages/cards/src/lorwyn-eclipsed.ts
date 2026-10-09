import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { ECL_WHITE, ECL_WHITE_BACKS, ECL_WHITE_TOKENS } from './ecl/white.ts';
import { ECL_BLUE, ECL_BLUE_BACKS, ECL_BLUE_TOKENS } from './ecl/blue.ts';
import { ECL_BLACK, ECL_BLACK_BACKS, ECL_BLACK_TOKENS } from './ecl/black.ts';
import { ECL_RED, ECL_RED_BACKS, ECL_RED_TOKENS } from './ecl/red.ts';
import { ECL_GREEN, ECL_GREEN_BACKS, ECL_GREEN_TOKENS } from './ecl/green.ts';
import { ECL_MULTI_A, ECL_MULTI_A_BACKS, ECL_MULTI_A_TOKENS } from './ecl/multi-a.ts';
import { ECL_MULTI_B, ECL_MULTI_B_BACKS, ECL_MULTI_B_TOKENS } from './ecl/multi-b.ts';
import { ECL_COLORLESS, ECL_COLORLESS_BACKS, ECL_COLORLESS_TOKENS } from './ecl/colorless.ts';
import { ECL_TRANSFORM, ECL_TRANSFORM_BACKS, ECL_TRANSFORM_TOKENS } from './ecl/transform.ts';
import { ECL_INCARNATIONS, ECL_INCARNATIONS_BACKS, ECL_INCARNATIONS_TOKENS } from './ecl/incarnations.ts';
import { ECL_THEME_DECK_CARDS, ECL_THEME_DECK_TOKENS } from './ecl/theme-decks.ts';
import { ECL_SHARED_TOKENS } from './ecl/tokens.ts';

/**
 * Lorwyn Eclipsed (ECL) card behaviour, one file per group in ecl/, merged
 * here. Printed characteristics come from Scryfall; only rules text lives here
 * (docs/lorwyn-eclipsed-plan.md).
 */
export const LORWYN_ECLIPSED_BEHAVIORS: Record<string, Behavior> = {
  ...ECL_WHITE,
  ...ECL_BLUE,
  ...ECL_BLACK,
  ...ECL_RED,
  ...ECL_GREEN,
  ...ECL_MULTI_A,
  ...ECL_MULTI_B,
  ...ECL_COLORLESS,
  ...ECL_TRANSFORM,
  ...ECL_INCARNATIONS,
  ...ECL_THEME_DECK_CARDS,
};

/** Back faces (the transformed sides of the two-faced legends): not cards of their own, so not in the pool. */
export const LORWYN_ECLIPSED_BACK_FACES: Record<string, Behavior> = {
  ...ECL_WHITE_BACKS,
  ...ECL_BLUE_BACKS,
  ...ECL_BLACK_BACKS,
  ...ECL_RED_BACKS,
  ...ECL_GREEN_BACKS,
  ...ECL_MULTI_A_BACKS,
  ...ECL_MULTI_B_BACKS,
  ...ECL_COLORLESS_BACKS,
  ...ECL_TRANSFORM_BACKS,
  ...ECL_INCARNATIONS_BACKS,
};

/** Lorwyn Eclipsed tokens (the shared Kithkin, Elf, Merfolk, ... and the one-card tokens). */
export const LORWYN_ECLIPSED_TOKENS: CardDefinition[] = [
  ...ECL_SHARED_TOKENS,
  ...ECL_WHITE_TOKENS,
  ...ECL_BLUE_TOKENS,
  ...ECL_BLACK_TOKENS,
  ...ECL_RED_TOKENS,
  ...ECL_GREEN_TOKENS,
  ...ECL_MULTI_A_TOKENS,
  ...ECL_MULTI_B_TOKENS,
  ...ECL_COLORLESS_TOKENS,
  ...ECL_TRANSFORM_TOKENS,
  ...ECL_INCARNATIONS_TOKENS,
  ...ECL_THEME_DECK_TOKENS,
];
