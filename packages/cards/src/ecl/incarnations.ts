import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Lorwyn Eclipsed (18b): the five evoke Elemental Incarnations (Catharsis, Deceit, Emptiness, Vibrance, Wistfulness). Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_INCARNATIONS_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */
export const ECL_INCARNATIONS: Record<string, Behavior> = {};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_INCARNATIONS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_INCARNATIONS_TOKENS: CardDefinition[] = [];
