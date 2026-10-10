import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * The Hobbit (20b): colorless (artifacts and lands) cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_COLORLESS_BACKS. See docs/the-hobbit-plan.md.
 */
export const HOB_COLORLESS: Record<string, Behavior> = {};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const HOB_COLORLESS_TOKENS: CardDefinition[] = [];
