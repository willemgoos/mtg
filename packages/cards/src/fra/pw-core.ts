import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Reality Fracture (17c): the planeswalker core: Jace token, Empower Jace and the commons. Printed characteristics come from Scryfall;
 * this file has the rules text. See docs/reality-fracture-plan.md.
 */
export const FRA_PW_CORE: Record<string, Behavior> = {};

/** Back faces (none expected here). */
export const FRA_PW_CORE_BACKS: Record<string, Behavior> = {};

/** Tokens only these cards make. */
export const FRA_PW_CORE_TOKENS: CardDefinition[] = [];
