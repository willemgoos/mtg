import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { LTR_WHITE, LTR_WHITE_BACKS, LTR_WHITE_TOKENS } from './ltr/white.ts';
import { LTR_BLUE, LTR_BLUE_BACKS, LTR_BLUE_TOKENS } from './ltr/blue.ts';
import { LTR_BLACK, LTR_BLACK_BACKS, LTR_BLACK_TOKENS } from './ltr/black.ts';
import { LTR_RED, LTR_RED_BACKS, LTR_RED_TOKENS } from './ltr/red.ts';
import { LTR_GREEN, LTR_GREEN_BACKS, LTR_GREEN_TOKENS } from './ltr/green.ts';
import { LTR_COLORLESS, LTR_COLORLESS_BACKS, LTR_COLORLESS_TOKENS } from './ltr/colorless.ts';
import { LTR_WHITE_RARE, LTR_WHITE_RARE_BACKS, LTR_WHITE_RARE_TOKENS } from './ltr/white-rare.ts';
import { LTR_BLUE_RARE, LTR_BLUE_RARE_BACKS, LTR_BLUE_RARE_TOKENS } from './ltr/blue-rare.ts';
import { LTR_BLACK_RARE, LTR_BLACK_RARE_BACKS, LTR_BLACK_RARE_TOKENS } from './ltr/black-rare.ts';
import { LTR_RED_RARE, LTR_RED_RARE_BACKS, LTR_RED_RARE_TOKENS } from './ltr/red-rare.ts';
import { LTR_GREEN_RARE, LTR_GREEN_RARE_BACKS, LTR_GREEN_RARE_TOKENS } from './ltr/green-rare.ts';
import { LTR_MULTICOLOUR_RARE, LTR_MULTICOLOUR_RARE_BACKS, LTR_MULTICOLOUR_RARE_TOKENS } from './ltr/multicolour-rare.ts';
import { LTR_COLORLESS_RARE, LTR_COLORLESS_RARE_BACKS, LTR_COLORLESS_RARE_TOKENS } from './ltr/colorless-rare.ts';
import { LTR_SHARED_TOKENS } from './ltr/tokens.ts';

/**
 * The Lord of the Rings: Tales of Middle-earth (LTR) card behaviour, one file per group in
 * ltr/, merged here. Printed characteristics come from Scryfall; only rules text lives here
 * (docs/lord-of-the-rings-plan.md).
 */
export const LORD_OF_THE_RINGS_BEHAVIORS: Record<string, Behavior> = {
  ...LTR_WHITE,
  ...LTR_BLUE,
  ...LTR_BLACK,
  ...LTR_RED,
  ...LTR_GREEN,
  ...LTR_COLORLESS,
  ...LTR_WHITE_RARE,
  ...LTR_BLUE_RARE,
  ...LTR_BLACK_RARE,
  ...LTR_RED_RARE,
  ...LTR_GREEN_RARE,
  ...LTR_MULTICOLOUR_RARE,
  ...LTR_COLORLESS_RARE,
};

/** Back faces: not cards of their own, so not in the pool. */
export const LORD_OF_THE_RINGS_BACK_FACES: Record<string, Behavior> = {
  ...LTR_WHITE_BACKS,
  ...LTR_BLUE_BACKS,
  ...LTR_BLACK_BACKS,
  ...LTR_RED_BACKS,
  ...LTR_GREEN_BACKS,
  ...LTR_COLORLESS_BACKS,
  ...LTR_WHITE_RARE_BACKS,
  ...LTR_BLUE_RARE_BACKS,
  ...LTR_BLACK_RARE_BACKS,
  ...LTR_RED_RARE_BACKS,
  ...LTR_GREEN_RARE_BACKS,
  ...LTR_MULTICOLOUR_RARE_BACKS,
  ...LTR_COLORLESS_RARE_BACKS,
};

/** The Lord of the Rings tokens (the shared Orc Army, Spirit, ... and the one-card tokens). */
export const LORD_OF_THE_RINGS_TOKENS: CardDefinition[] = [
  ...LTR_SHARED_TOKENS,
  ...LTR_WHITE_TOKENS,
  ...LTR_BLUE_TOKENS,
  ...LTR_BLACK_TOKENS,
  ...LTR_RED_TOKENS,
  ...LTR_GREEN_TOKENS,
  ...LTR_COLORLESS_TOKENS,
  ...LTR_WHITE_RARE_TOKENS,
  ...LTR_BLUE_RARE_TOKENS,
  ...LTR_BLACK_RARE_TOKENS,
  ...LTR_RED_RARE_TOKENS,
  ...LTR_GREEN_RARE_TOKENS,
  ...LTR_MULTICOLOUR_RARE_TOKENS,
  ...LTR_COLORLESS_RARE_TOKENS,
];
