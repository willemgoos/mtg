import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Lorwyn Eclipsed (18b): gold cards of W/U, U/B, B/R, R/G and G/W. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_MULTI_A_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */
export const ECL_MULTI_A: Record<string, Behavior> = {};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_MULTI_A_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_MULTI_A_TOKENS: CardDefinition[] = [];
