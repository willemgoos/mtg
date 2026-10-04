import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Reality Fracture (17a): gold cards of W/U, U/B, B/R, R/G and G/W. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_MULTI_A_BACKS. See docs/reality-fracture-plan.md.
 */
export const FRA_MULTI_A: Record<string, Behavior> = {};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_MULTI_A_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const FRA_MULTI_A_TOKENS: CardDefinition[] = [];
