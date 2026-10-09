import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Lorwyn Eclipsed (18b): colourless cards and nonbasic lands. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_COLORLESS_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */
export const ECL_COLORLESS: Record<string, Behavior> = {};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_COLORLESS_TOKENS: CardDefinition[] = [];
