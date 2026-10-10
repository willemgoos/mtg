import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Tarkir: Dragonstorm (19b): the Mardu and Temur cards (the other clans and the five-colour one are in clans.ts). Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_CLANS_B_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */
export const TDM_CLANS_B: Record<string, Behavior> = {};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_CLANS_B_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_CLANS_B_TOKENS: CardDefinition[] = [];
