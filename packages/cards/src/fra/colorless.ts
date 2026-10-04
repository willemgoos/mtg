import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Reality Fracture (17a): colourless cards and nonbasic lands. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_COLORLESS_BACKS. See docs/reality-fracture-plan.md.
 */
export const FRA_COLORLESS: Record<string, Behavior> = {};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const FRA_COLORLESS_TOKENS: CardDefinition[] = [];
