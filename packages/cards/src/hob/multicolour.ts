import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * The Hobbit (20b): multicolour (gold and hybrid) cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_MULTICOLOUR_BACKS. See docs/the-hobbit-plan.md.
 */
export const HOB_MULTICOLOUR: Record<string, Behavior> = {};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_MULTICOLOUR_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const HOB_MULTICOLOUR_TOKENS: CardDefinition[] = [];
