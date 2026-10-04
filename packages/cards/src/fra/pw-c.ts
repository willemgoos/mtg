import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Reality Fracture (17c): planeswalker rares and mythics, including the eight planeswalker cards. Printed characteristics come from Scryfall;
 * this file has the rules text. See docs/reality-fracture-plan.md.
 */
export const FRA_PW_C: Record<string, Behavior> = {};

/** Back faces (none expected here). */
export const FRA_PW_C_BACKS: Record<string, Behavior> = {};

/** Tokens only these cards make. */
export const FRA_PW_C_TOKENS: CardDefinition[] = [];
