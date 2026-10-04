import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { FRA_WHITE, FRA_WHITE_BACKS, FRA_WHITE_TOKENS } from './fra/white.ts';
import { FRA_BLUE, FRA_BLUE_BACKS, FRA_BLUE_TOKENS } from './fra/blue.ts';
import { FRA_BLACK, FRA_BLACK_BACKS, FRA_BLACK_TOKENS } from './fra/black.ts';
import { FRA_RED, FRA_RED_BACKS, FRA_RED_TOKENS } from './fra/red.ts';
import { FRA_GREEN, FRA_GREEN_BACKS, FRA_GREEN_TOKENS } from './fra/green.ts';
import { FRA_MULTI_A, FRA_MULTI_A_BACKS, FRA_MULTI_A_TOKENS } from './fra/multi-a.ts';
import { FRA_MULTI_B, FRA_MULTI_B_BACKS, FRA_MULTI_B_TOKENS } from './fra/multi-b.ts';
import { FRA_COLORLESS, FRA_COLORLESS_BACKS, FRA_COLORLESS_TOKENS } from './fra/colorless.ts';
import { FRA_SHARED_TOKENS } from './fra/tokens.ts';

/**
 * Reality Fracture (FRA) card behaviour, one file per group in fra/, merged
 * here. Printed characteristics come from Scryfall; only rules text lives here
 * (docs/reality-fracture-plan.md).
 */
export const REALITY_FRACTURE_BEHAVIORS: Record<string, Behavior> = {
  ...FRA_WHITE,
  ...FRA_BLUE,
  ...FRA_BLACK,
  ...FRA_RED,
  ...FRA_GREEN,
  ...FRA_MULTI_A,
  ...FRA_MULTI_B,
  ...FRA_COLORLESS,
};

/** Back faces (the prepare spells): not cards of their own, so not in the pool. */
export const REALITY_FRACTURE_BACK_FACES: Record<string, Behavior> = {
  ...FRA_WHITE_BACKS,
  ...FRA_BLUE_BACKS,
  ...FRA_BLACK_BACKS,
  ...FRA_RED_BACKS,
  ...FRA_GREEN_BACKS,
  ...FRA_MULTI_A_BACKS,
  ...FRA_MULTI_B_BACKS,
  ...FRA_COLORLESS_BACKS,
};

/** Reality Fracture tokens (Cadet, Heartwood and the one-card tokens). */
export const REALITY_FRACTURE_TOKENS: CardDefinition[] = [
  ...FRA_SHARED_TOKENS,
  ...FRA_WHITE_TOKENS,
  ...FRA_BLUE_TOKENS,
  ...FRA_BLACK_TOKENS,
  ...FRA_RED_TOKENS,
  ...FRA_GREEN_TOKENS,
  ...FRA_MULTI_A_TOKENS,
  ...FRA_MULTI_B_TOKENS,
  ...FRA_COLORLESS_TOKENS,
];
