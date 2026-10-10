import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { TDM_WHITE, TDM_WHITE_BACKS, TDM_WHITE_TOKENS } from './tdm/white.ts';
import { TDM_BLUE, TDM_BLUE_BACKS, TDM_BLUE_TOKENS } from './tdm/blue.ts';
import { TDM_BLACK, TDM_BLACK_BACKS, TDM_BLACK_TOKENS } from './tdm/black.ts';
import { TDM_RED, TDM_RED_BACKS, TDM_RED_TOKENS } from './tdm/red.ts';
import { TDM_GREEN, TDM_GREEN_BACKS, TDM_GREEN_TOKENS } from './tdm/green.ts';
import { TDM_TWO_COLOUR, TDM_TWO_COLOUR_BACKS, TDM_TWO_COLOUR_TOKENS } from './tdm/two-colour.ts';
import { TDM_CLANS, TDM_CLANS_BACKS, TDM_CLANS_TOKENS } from './tdm/clans.ts';
import { TDM_CLANS_B, TDM_CLANS_B_BACKS, TDM_CLANS_B_TOKENS } from './tdm/clans-b.ts';
import { TDM_COLORLESS, TDM_COLORLESS_BACKS, TDM_COLORLESS_TOKENS } from './tdm/colorless.ts';
import { TDM_SHARED_TOKENS } from './tdm/tokens.ts';

/**
 * Tarkir: Dragonstorm (TDM) card behaviour, one file per group in tdm/, merged
 * here. Printed characteristics come from Scryfall; only rules text lives here
 * (docs/tarkir-dragonstorm-plan.md).
 */
export const TARKIR_DRAGONSTORM_BEHAVIORS: Record<string, Behavior> = {
  ...TDM_WHITE,
  ...TDM_BLUE,
  ...TDM_BLACK,
  ...TDM_RED,
  ...TDM_GREEN,
  ...TDM_TWO_COLOUR,
  ...TDM_CLANS,
  ...TDM_CLANS_B,
  ...TDM_COLORLESS,
};

/** Back faces (the Omen spell sides): not cards of their own, so not in the pool. */
export const TARKIR_DRAGONSTORM_BACK_FACES: Record<string, Behavior> = {
  ...TDM_WHITE_BACKS,
  ...TDM_BLUE_BACKS,
  ...TDM_BLACK_BACKS,
  ...TDM_RED_BACKS,
  ...TDM_GREEN_BACKS,
  ...TDM_TWO_COLOUR_BACKS,
  ...TDM_CLANS_BACKS,
  ...TDM_CLANS_B_BACKS,
  ...TDM_COLORLESS_BACKS,
};

/** Tarkir: Dragonstorm tokens (the shared Warrior, Spirit, ... and the one-card tokens). */
export const TARKIR_DRAGONSTORM_TOKENS: CardDefinition[] = [
  ...TDM_SHARED_TOKENS,
  ...TDM_WHITE_TOKENS,
  ...TDM_BLUE_TOKENS,
  ...TDM_BLACK_TOKENS,
  ...TDM_RED_TOKENS,
  ...TDM_GREEN_TOKENS,
  ...TDM_TWO_COLOUR_TOKENS,
  ...TDM_CLANS_TOKENS,
  ...TDM_CLANS_B_TOKENS,
  ...TDM_COLORLESS_TOKENS,
];
