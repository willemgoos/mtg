import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { HOB_WHITE, HOB_WHITE_BACKS, HOB_WHITE_TOKENS } from './hob/white.ts';
import { HOB_BLUE, HOB_BLUE_BACKS, HOB_BLUE_TOKENS } from './hob/blue.ts';
import { HOB_BLACK, HOB_BLACK_BACKS, HOB_BLACK_TOKENS } from './hob/black.ts';
import { HOB_RED, HOB_RED_BACKS, HOB_RED_TOKENS } from './hob/red.ts';
import { HOB_GREEN, HOB_GREEN_BACKS, HOB_GREEN_TOKENS } from './hob/green.ts';
import {
  HOB_MULTICOLOUR,
  HOB_MULTICOLOUR_BACKS,
  HOB_MULTICOLOUR_TOKENS,
} from './hob/multicolour.ts';
import { HOB_COLORLESS, HOB_COLORLESS_BACKS, HOB_COLORLESS_TOKENS } from './hob/colorless.ts';
import { HOB_SHARED_TOKENS } from './hob/tokens.ts';

/**
 * The Hobbit (HOB) card behaviour, one file per group in hob/, merged here.
 * Printed characteristics come from Scryfall; only rules text lives here
 * (docs/the-hobbit-plan.md).
 */
export const THE_HOBBIT_BEHAVIORS: Record<string, Behavior> = {
  ...HOB_WHITE,
  ...HOB_BLUE,
  ...HOB_BLACK,
  ...HOB_RED,
  ...HOB_GREEN,
  ...HOB_MULTICOLOUR,
  ...HOB_COLORLESS,
};

/** Back faces (the Adventure spell sides): not cards of their own, so not in the pool. */
export const THE_HOBBIT_BACK_FACES: Record<string, Behavior> = {
  ...HOB_WHITE_BACKS,
  ...HOB_BLUE_BACKS,
  ...HOB_BLACK_BACKS,
  ...HOB_RED_BACKS,
  ...HOB_GREEN_BACKS,
  ...HOB_MULTICOLOUR_BACKS,
  ...HOB_COLORLESS_BACKS,
};

/** The Hobbit tokens (the shared Goblin Army, Human Soldier, ... and the one-card tokens). */
export const THE_HOBBIT_TOKENS: CardDefinition[] = [
  ...HOB_SHARED_TOKENS,
  ...HOB_WHITE_TOKENS,
  ...HOB_BLUE_TOKENS,
  ...HOB_BLACK_TOKENS,
  ...HOB_RED_TOKENS,
  ...HOB_GREEN_TOKENS,
  ...HOB_MULTICOLOUR_TOKENS,
  ...HOB_COLORLESS_TOKENS,
];
