import type { Behavior } from './build.ts';

/**
 * Secrets of Strixhaven (SOS) card behaviour, one file per group of decks in
 * sos/, merged here. Printed characteristics come from Scryfall; only rules
 * text lives here (docs/strixhaven-plan.md).
 */
export const SECRETS_OF_STRIXHAVEN_BEHAVIORS: Record<string, Behavior> = {};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const SECRETS_OF_STRIXHAVEN_BACK_FACES: Record<string, Behavior> = {};
