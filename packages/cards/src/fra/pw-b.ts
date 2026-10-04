import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Reality Fracture (17c): planeswalker uncommons (the Way of the … cycle and the rest). Printed characteristics come from Scryfall;
 * this file has the rules text. See docs/reality-fracture-plan.md.
 */
export const FRA_PW_B: Record<string, Behavior> = {};

/** Back faces (none expected here). */
export const FRA_PW_B_BACKS: Record<string, Behavior> = {};

/** Tokens only these cards make. */
export const FRA_PW_B_TOKENS: CardDefinition[] = [];
