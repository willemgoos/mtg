import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { WOE_WHITE, WOE_WHITE_BACKS, WOE_WHITE_TOKENS } from './woe/white.ts';
import { WOE_BLUE, WOE_BLUE_BACKS, WOE_BLUE_TOKENS } from './woe/blue.ts';
import { WOE_BLACK, WOE_BLACK_BACKS, WOE_BLACK_TOKENS } from './woe/black.ts';
import { WOE_RED, WOE_RED_BACKS, WOE_RED_TOKENS } from './woe/red.ts';
import { WOE_GREEN, WOE_GREEN_BACKS, WOE_GREEN_TOKENS } from './woe/green.ts';
import { WOE_MULTICOLOUR, WOE_MULTICOLOUR_BACKS, WOE_MULTICOLOUR_TOKENS } from './woe/multicolour.ts';
import { WOE_COLORLESS, WOE_COLORLESS_BACKS, WOE_COLORLESS_TOKENS } from './woe/colorless.ts';
import { WOE_LAND, WOE_LAND_BACKS, WOE_LAND_TOKENS } from './woe/land.ts';
import { WOE_WHITE_MAIN, WOE_WHITE_MAIN_BACKS, WOE_WHITE_MAIN_TOKENS } from './woe/white-main.ts';
import { WOE_BLUE_MAIN, WOE_BLUE_MAIN_BACKS, WOE_BLUE_MAIN_TOKENS } from './woe/blue-main.ts';
import { WOE_BLACK_MAIN, WOE_BLACK_MAIN_BACKS, WOE_BLACK_MAIN_TOKENS } from './woe/black-main.ts';
import { WOE_RED_MAIN, WOE_RED_MAIN_BACKS, WOE_RED_MAIN_TOKENS } from './woe/red-main.ts';
import { WOE_GREEN_MAIN, WOE_GREEN_MAIN_BACKS, WOE_GREEN_MAIN_TOKENS } from './woe/green-main.ts';
import { WOE_MULTICOLOUR_MAIN, WOE_MULTICOLOUR_MAIN_BACKS, WOE_MULTICOLOUR_MAIN_TOKENS } from './woe/multicolour-main.ts';
import { WOE_COLORLESS_MAIN, WOE_COLORLESS_MAIN_BACKS, WOE_COLORLESS_MAIN_TOKENS } from './woe/colorless-main.ts';
import { WOE_LAND_MAIN, WOE_LAND_MAIN_BACKS, WOE_LAND_MAIN_TOKENS } from './woe/land-main.ts';
import { WOE_SHARED_TOKENS } from './woe/tokens.ts';

/**
 * Wilds of Eldraine (WOE) card behaviour, one file per group in woe/, merged here. Printed
 * characteristics come from Scryfall; only rules text lives here (docs/wilds-of-eldraine-plan.md).
 */
export const WILDS_OF_ELDRAINE_BEHAVIORS: Record<string, Behavior> = {
  ...WOE_WHITE,
  ...WOE_BLUE,
  ...WOE_BLACK,
  ...WOE_RED,
  ...WOE_GREEN,
  ...WOE_MULTICOLOUR,
  ...WOE_COLORLESS,
  ...WOE_LAND,
  ...WOE_WHITE_MAIN,
  ...WOE_BLUE_MAIN,
  ...WOE_BLACK_MAIN,
  ...WOE_RED_MAIN,
  ...WOE_GREEN_MAIN,
  ...WOE_MULTICOLOUR_MAIN,
  ...WOE_COLORLESS_MAIN,
  ...WOE_LAND_MAIN,
};

/** Back faces (Adventure spell sides): not cards of their own, so not in the pool. */
export const WILDS_OF_ELDRAINE_BACK_FACES: Record<string, Behavior> = {
  ...WOE_WHITE_BACKS,
  ...WOE_BLUE_BACKS,
  ...WOE_BLACK_BACKS,
  ...WOE_RED_BACKS,
  ...WOE_GREEN_BACKS,
  ...WOE_MULTICOLOUR_BACKS,
  ...WOE_COLORLESS_BACKS,
  ...WOE_LAND_BACKS,
  ...WOE_WHITE_MAIN_BACKS,
  ...WOE_BLUE_MAIN_BACKS,
  ...WOE_BLACK_MAIN_BACKS,
  ...WOE_RED_MAIN_BACKS,
  ...WOE_GREEN_MAIN_BACKS,
  ...WOE_MULTICOLOUR_MAIN_BACKS,
  ...WOE_COLORLESS_MAIN_BACKS,
  ...WOE_LAND_MAIN_BACKS,
};

/** The Wilds of Eldraine tokens. */
export const WILDS_OF_ELDRAINE_TOKENS: CardDefinition[] = [
  ...WOE_SHARED_TOKENS,
  ...WOE_WHITE_TOKENS,
  ...WOE_BLUE_TOKENS,
  ...WOE_BLACK_TOKENS,
  ...WOE_RED_TOKENS,
  ...WOE_GREEN_TOKENS,
  ...WOE_MULTICOLOUR_TOKENS,
  ...WOE_COLORLESS_TOKENS,
  ...WOE_LAND_TOKENS,
  ...WOE_WHITE_MAIN_TOKENS,
  ...WOE_BLUE_MAIN_TOKENS,
  ...WOE_BLACK_MAIN_TOKENS,
  ...WOE_RED_MAIN_TOKENS,
  ...WOE_GREEN_MAIN_TOKENS,
  ...WOE_MULTICOLOUR_MAIN_TOKENS,
  ...WOE_COLORLESS_MAIN_TOKENS,
  ...WOE_LAND_MAIN_TOKENS,
];
