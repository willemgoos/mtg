import type { Behavior } from './build.ts';

/**
 * Strixhaven (STX) card behaviour, one file per group of decks in stx/,
 * merged here. Printed characteristics come from Scryfall; only rules text
 * lives here. Filled in from the first Strixhaven deck phase on
 * (docs/strixhaven-plan.md).
 */
export const STRIXHAVEN_BEHAVIORS: Record<string, Behavior> = {};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const STRIXHAVEN_BACK_FACES: Record<string, Behavior> = {};
