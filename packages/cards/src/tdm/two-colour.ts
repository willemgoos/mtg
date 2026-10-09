import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Tarkir: Dragonstorm (19b): all two-colour (gold and hybrid) cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_TWO_COLOUR_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */
export const TDM_TWO_COLOUR: Record<string, Behavior> = {};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_TWO_COLOUR_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_TWO_COLOUR_TOKENS: CardDefinition[] = [];
