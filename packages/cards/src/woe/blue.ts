import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * Wilds of Eldraine (23): blue cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_BLUE_BACKS. See docs/wilds-of-eldraine-plan.md.
 */
export const WOE_BLUE: Record<string, Behavior> = {};

/** Back faces: keyed by their own names. */
export const WOE_BLUE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const WOE_BLUE_TOKENS: CardDefinition[] = [];
