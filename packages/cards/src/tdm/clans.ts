import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Tarkir: Dragonstorm (19b): all three-colour (clan) cards and the five-colour one. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_CLANS_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */
export const TDM_CLANS: Record<string, Behavior> = {};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_CLANS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_CLANS_TOKENS: CardDefinition[] = [];
