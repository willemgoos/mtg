import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';

/**
 * The Lord of the Rings (21d): white rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_WHITE_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */
export const LTR_WHITE_RARE: Record<string, Behavior> = {};

/** Back faces: keyed by their own names. */
export const LTR_WHITE_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_WHITE_RARE_TOKENS: CardDefinition[] = [];
