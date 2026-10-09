import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Tarkir: Dragonstorm (19b): artifacts, Monuments, colourless planeswalker and nonbasic lands. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_COLORLESS_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */
export const TDM_COLORLESS: Record<string, Behavior> = {};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_COLORLESS_TOKENS: CardDefinition[] = [];
